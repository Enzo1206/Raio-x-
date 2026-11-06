"""Coletor do diagnóstico: busca um @ na fila do site, lê o Instagram sem login e devolve o resultado.

Usa o projeto omkarcloud/instagram-scraper, em uma versão fixa (veja instalar.cmd).
Só fala com o Instagram e com o seu site. Não usa conta nem senha do Instagram.
"""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

PASTA = os.path.dirname(os.path.abspath(__file__))

JANELA_DIAS = 90
MAX_POSTS_COMENTADOS = 6
MAX_COMENTARIOS_POR_POST = 40
MAX_PAGINAS = 3
PAUSA_ENTRE_PAGINAS = 2
PAUSA_ENTRE_POSTS = 3
PAUSA_ENTRE_PERFIS = (45, 90)
PAUSA_FILA_VAZIA = 30
PAUSA_BLOQUEIO = 30 * 60
PAUSA_ERRO = 60
# Em contas grandes, o Instagram às vezes entrega exatamente 3 curtidas para quem não está logado.
CURTIDAS_SUSPEITAS = 3
SEGUIDORES_CONTA_GRANDE = 10000

TIPOS = {"video": "Video", "carousel": "Sidecar", "image": "Image"}


def ler_config():
    config = {}
    caminho = os.path.join(PASTA, ".env")
    if os.path.exists(caminho):
        with open(caminho, encoding="utf-8") as arquivo:
            for linha in arquivo:
                if "=" in linha and not linha.lstrip().startswith("#"):
                    chave, valor = linha.strip().split("=", 1)
                    config[chave] = valor
    config.update({k: os.environ[k] for k in ("SITE", "COLETOR_CHAVE") if k in os.environ})
    if not config.get("SITE") or not config.get("COLETOR_CHAVE"):
        sys.exit("Faltam SITE e COLETOR_CHAVE no arquivo coletor/.env")
    return config


def converter_perfil(p):
    return {
        "username": p.get("username"),
        "fullName": p.get("full_name"),
        "biography": p.get("biography"),
        "externalUrl": p.get("external_link"),
        "followersCount": p.get("follower_count"),
        "followsCount": p.get("following_count"),
        "postsCount": p.get("post_count"),
        "verified": p.get("is_verified"),
        "isBusinessAccount": p.get("is_business"),
        "businessCategoryName": p.get("category"),
        "profilePicUrl": p.get("profile_picture"),
    }


def converter_post(x, seguidores=0):
    e = x.get("stats") or {}
    curtidas = e.get("like_count")
    if curtidas is None or (curtidas == CURTIDAS_SUSPEITAS and seguidores >= SEGUIDORES_CONTA_GRANDE):
        curtidas = -1
    return {
        "url": x.get("link"),
        "shortCode": x.get("code"),
        "type": TIPOS.get(x.get("type"), "Image"),
        "timestamp": x.get("published_at"),
        "caption": x.get("caption"),
        "isPinned": x.get("is_pinned"),
        "commentsCount": e.get("comment_count") or 0,
        "likesCount": curtidas,
        "videoPlayCount": e.get("play_count"),
        "videoViewCount": e.get("view_count"),
        "displayUrl": x.get("image"),
    }


def converter_comentario(c):
    return {
        "ownerUsername": (c.get("user") or {}).get("username"),
        "text": c.get("text"),
        "timestamp": c.get("created_at"),
        "likesCount": c.get("like_count"),
        # O Instagram não informa respostas para quem não está logado.
        "repliesCount": None,
    }


def _data(post):
    try:
        return datetime.fromisoformat(str(post["timestamp"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None


def posts_da_janela(posts, agora=None):
    agora = agora or datetime.now(timezone.utc)
    limite = agora - timedelta(days=JANELA_DIAS)
    recentes = [p for p in posts if (_data(p) or limite) > limite]
    return recentes or posts


def posts_para_comentarios(posts, desligados=frozenset()):
    com_comentarios = [p for p in posts if p["commentsCount"] > 0 and p["shortCode"] not in desligados]
    return sorted(com_comentarios, key=lambda p: -p["commentsCount"])[:MAX_POSTS_COMENTADOS]


def coletar(username, ig):
    """Lê um perfil. Devolve o corpo a enviar para o site."""
    refs, users, posts_ig, nao_encontrado = ig
    usuario = refs.resolve_user(username)
    try:
        perfil = users.get_profile(usuario)
    except nao_encontrado:
        return {"username": username, "status": "nao_encontrado"}
    if perfil.get("is_private"):
        return {"username": username, "status": "privado"}

    grade = users.get_posts(usuario).get("posts") or []
    seguidores = perfil.get("follower_count") or 0
    posts = posts_da_janela([converter_post(x, seguidores) for x in grade])
    desligados = {x.get("code") for x in grade if x.get("are_comments_disabled")}

    comentarios = []
    for post in posts_para_comentarios(posts, desligados):
        ref = refs.resolve_post(post["url"])
        cursor, lidos = None, 0
        for _ in range(MAX_PAGINAS):
            pagina = posts_ig.get_comments(ref, cursor)
            lista = pagina.get("comments") or []
            restantes = MAX_COMENTARIOS_POR_POST - lidos
            comentarios.extend(converter_comentario(c) for c in lista[:restantes])
            lidos += min(len(lista), restantes)
            cursor = pagina.get("next_cursor")
            if lidos >= MAX_COMENTARIOS_POR_POST or not pagina.get("has_more") or not cursor:
                break
            time.sleep(PAUSA_ENTRE_PAGINAS)
        time.sleep(PAUSA_ENTRE_POSTS)

    return {
        "username": username,
        "status": "ok",
        "perfil": converter_perfil(perfil),
        "posts": posts,
        "comentarios": comentarios,
    }


def chamar_site(config, caminho, corpo=None):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    pedido = urllib.request.Request(
        config["SITE"].rstrip("/") + caminho,
        data=dados,
        headers={
            "Authorization": f"Bearer {config['COLETOR_CHAVE']}",
            "Content-Type": "application/json",
            "User-Agent": "coletor-diagnostico/1.0",
        },
    )
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        return json.loads(resposta.read().decode("utf-8") or "{}")


def agora_txt():
    return datetime.now().strftime("%H:%M:%S")


def main():
    uma_vez = "--uma-vez" in sys.argv
    config = ler_config()
    pasta_ig = os.environ.get("COLETOR_VENDOR") or os.path.join(PASTA, "vendor", "instagram-scraper")
    sys.path.insert(0, pasta_ig)
    from instagram import posts as posts_ig, refs, users
    from instagram.fetch import InstagramBlocked, InstagramGated, InstagramNotFound, InstagramRateLimited

    ig = (refs, users, posts_ig, InstagramNotFound)
    bloqueios = (InstagramBlocked, InstagramGated, InstagramRateLimited)
    print(f"{agora_txt()} Coletor ligado. Deixe esta janela aberta; para parar, feche a janela.", flush=True)

    while True:
        try:
            username = chamar_site(config, "/api/coletor/proximo").get("username")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                sys.exit("O site recusou a COLETOR_CHAVE. Confira o arquivo coletor/.env.")
            print(f"{agora_txt()} Site respondeu {e.code}. Tentando de novo em breve.", flush=True)
            time.sleep(PAUSA_ERRO)
            continue
        except (urllib.error.URLError, OSError) as e:
            print(f"{agora_txt()} Sem conexão com o site ({type(e).__name__}). Tentando de novo em breve.", flush=True)
            time.sleep(PAUSA_ERRO)
            continue

        if not username:
            if uma_vez:
                print(f"{agora_txt()} Fila vazia.", flush=True)
                return
            time.sleep(PAUSA_FILA_VAZIA)
            continue

        print(f"{agora_txt()} Lendo @{username}...", flush=True)
        inicio = time.time()
        try:
            corpo = coletar(username, ig)
            chamar_site(config, "/api/coletor/resultado", corpo)
            lidos = len(corpo.get("comentarios") or [])
            print(f"{agora_txt()} @{username}: {corpo['status']}, {lidos} comentários, {time.time() - inicio:.0f}s", flush=True)
            time.sleep(0 if uma_vez else random.uniform(*PAUSA_ENTRE_PERFIS))
        except bloqueios as e:
            print(f"{agora_txt()} O Instagram limitou a leitura ({type(e).__name__}). Pausa de {PAUSA_BLOQUEIO // 60} minutos.", flush=True)
            _devolver(config, username, bloqueado=True)
            if uma_vez:
                return
            time.sleep(PAUSA_BLOQUEIO)
        except Exception as e:
            print(f"{agora_txt()} Falha em @{username}: {type(e).__name__}: {str(e)[:150]}", flush=True)
            _devolver(config, username, bloqueado=False)
            time.sleep(PAUSA_ERRO if not uma_vez else 0)


def _devolver(config, username, bloqueado):
    try:
        chamar_site(config, "/api/coletor/falha", {"username": username, "bloqueado": bloqueado})
    except (urllib.error.URLError, OSError):
        pass  # O site devolve sozinho para a fila depois de 10 minutos.


if __name__ == "__main__":
    main()
