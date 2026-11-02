"""Convert moto.db (BILBIL0903/UYGHUR_DATASET resources/db/moto.db) to data/bank.json + data/img/.
Usage: python3 scripts/build-bank.py /path/to/moto.db"""
import sqlite3, json, re, sys, os, urllib.request, html
db = sys.argv[1] if len(sys.argv) > 1 else '/tmp/moto.db'
c = sqlite3.connect(db)
rows = c.execute("""select qq._id, qq.style, qq.question, qq.options, qq.answer, qq.explain, qq.media, t.name, t._id
 from t_question_tag q join t_tag t on t._id=q.tag_id join t_question qq on qq._id=q.question_id
 where q.tag_type='chapter' and q.label_id=1 and t.city_code='0' order by t._id, qq.display_order""").fetchall()
out = []
for qid, style, stem, opts, ans, expl, media, chap, _ in rows:
    if style not in (0, 1): continue
    options = json.loads(opts)
    idx = [i for i in range(4) if ans & (16 << i)]
    assert len(idx) == 1, (qid, ans)
    q = dict(id=str(qid), type='judge' if style == 0 else 'single', stem=stem.strip(), options=options,
             answer=idx[0], explanation=html.unescape(re.sub(r'<[^>]+>', '', expl or '')).strip(), chapter=chap)
    if media:
        m = json.loads(media)
        if m.get('type') == 'image':
            fn = f"{qid}.jpg"; p = f"data/img/{fn}"
            if not os.path.exists(p):
                url = m['url'].replace('http://', 'https://')
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                open(p, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
            q['image'] = f"img/{fn}"
    out.append(q)
ver = c.execute("select value from t_db_version where key='version'").fetchone()[0]
bank = dict(version=f"moto-k1-{ver}", name="摩托车科目一（全国题）", source="https://github.com/BILBIL0903/UYGHUR_DATASET/blob/main/resources/db/moto.db",
            count=len(out), questions=out)
json.dump(bank, open('data/bank.json', 'w'), ensure_ascii=False, indent=1)
print(len(out), sum(1 for q in out if 'image' in q))
