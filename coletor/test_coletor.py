import unittest
from datetime import datetime, timezone

import coletor


def bruto(codigo="abc", tipo="video", curtidas=10, comentarios=2, data="2026-10-20T10:00:00Z"):
    return {
        "link": f"https://www.instagram.com/reel/{codigo}/", "code": codigo, "type": tipo, "published_at": data,
        "caption": "Legenda", "is_pinned": False, "image": "https://exemplo.test/a.jpg",
        "stats": {"like_count": curtidas, "comment_count": comentarios, "play_count": 1929, "view_count": None},
    }


class Conversao(unittest.TestCase):
    def test_post_vira_o_formato_do_site(self):
        p = coletor.converter_post(bruto())
        self.assertEqual((p["type"], p["likesCount"], p["commentsCount"], p["videoPlayCount"]), ("Video", 10, 2, 1929))

    def test_tres_curtidas_em_conta_grande_nao_e_confiavel(self):
        self.assertEqual(coletor.converter_post(bruto(curtidas=3), 3_000_000)["likesCount"], -1)
        self.assertEqual(coletor.converter_post(bruto(curtidas=3), 900)["likesCount"], 3)
        self.assertEqual(coletor.converter_post(bruto(curtidas=None), 900)["likesCount"], -1)

    def test_comentario_nao_inventa_respostas(self):
        c = coletor.converter_comentario({"user": {"username": "ana"}, "text": "oi", "created_at": "x", "like_count": 1, "reply_count": None})
        self.assertEqual((c["ownerUsername"], c["repliesCount"]), ("ana", None))

    def test_escolhe_janela_e_mais_comentados(self):
        agora = datetime(2026, 11, 2, tzinfo=timezone.utc)
        posts = [coletor.converter_post(bruto("velho", data="2026-01-01T00:00:00Z", comentarios=99)),
                 coletor.converter_post(bruto("novo", comentarios=5)),
                 coletor.converter_post(bruto("off", comentarios=50)),
                 coletor.converter_post(bruto("zero", comentarios=0))]
        janela = coletor.posts_da_janela(posts, agora)
        self.assertEqual([p["shortCode"] for p in janela], ["novo", "off", "zero"])
        self.assertEqual([p["shortCode"] for p in coletor.posts_para_comentarios(janela, {"off"})], ["novo"])

    def test_perfil_sem_posts_recentes_usa_os_que_tem(self):
        agora = datetime(2026, 11, 2, tzinfo=timezone.utc)
        posts = [coletor.converter_post(bruto("velho", data="2026-01-01T00:00:00Z"))]
        self.assertEqual(len(coletor.posts_da_janela(posts, agora)), 1)


if __name__ == "__main__":
    unittest.main()
