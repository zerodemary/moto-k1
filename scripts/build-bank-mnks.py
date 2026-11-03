import json,glob,re,os,html as H,collections
R='/workspace/moto-k1-research'
old=json.load(open('/workspace/moto-k1/data/bank.json'))
def norm(s): return re.sub(r'[\s，。？?、,.：:（）()“”"\'！!；;…_-]','',s or '')
def key(stem,opts): return norm(stem)+'|'+'|'.join(sorted(norm(o) for o in opts))
oldmap=collections.defaultdict(list)
for q in old['questions']: oldmap[key(q['stem'],q['options'])].append(q)
def clean(t): return H.unescape(re.sub(r'<[^>]+>','',t)).strip()
def expl(code):
    p=f'{R}/ybjk/html/{code}.htm'
    if not os.path.exists(p): return ''
    s=open(p,errors='ignore').read(); i=s.find('</form>')
    m=re.search(r'<p>(.*?)</p>',s[i:],re.S) if i>=0 else None
    return clean(m.group(1).replace('<br/>','\n')) if m else ''
def chap(stem):
    if re.search(r'事故|逃逸|伤员|保险公司|现场',stem): return '道路交通事故处理相关规定'
    if re.search(r'记\d+分|记几分|罚款|拘留|吊销|刑|有期徒刑|处罚|扣留',stem): return '道路交通安全违法行为及处罚'
    if re.search(r'驾驶证|实习期|登记|号牌|行驶证|检验|申请|准驾|记分周期|换证',stem): return '驾驶证和机动车管理规定'
    return '道路通行条件及通行规定'
codes_nat=re.search(r'ExamCodes = "([^"]+)',open(f'{R}/ybjk/codes_sxlx.js').read()).group(1).split(',')
codes_zj=re.search(r'ExamCodes = "([^"]+)',open(f'{R}/codes_jsyks_zj_pcaonly33.js').read()).group(1).split(',')
FILL=json.load(open(f'{R}/fill/fill.json'))
out=[];missing_img=[];absent=[];matched_old=set();diff_ans=[];new=[]
for code in codes_nat+codes_zj:
    p=f'{R}/ybjk/raw/{code}.json'
    if not os.path.exists(p): absent.append(code); continue
    d=json.load(open(p)); parts=d['tm'].split('<br/>')
    if d['tx']==1: stem=clean(d['tm']); opts=['正确','错误']; ans=0 if d['da']=='对' else 1; typ='judge'
    else:
        stem=clean(parts[0]); opts=[re.sub(r'^[A-D]、','',clean(x)) for x in parts[1:] if clean(x)]; ans='ABCD'.index(d['da']); typ='single'
    q={'id':'yb-'+code,'type':typ,'stem':stem,'options':opts,'answer':ans,'explanation':expl(code),
       'chapter':'浙江地方题' if d['pca']==33 else chap(stem)}
    k=key(stem,opts); olds=oldmap.get(k,[])
    if d['tp']:
        olds=[o for o in olds if o.get('image') and o['options'][o['answer']]==opts[ans] and o['id'] not in matched_old]
        olds=olds[:1]
    if olds:
        o=olds[0]; matched_old.update(x['id'] for x in (olds if not d['tp'] else olds[:1]))
        if d['pca']!=33: q['chapter']=o['chapter']
        if o['options'][o['answer']]!=opts[ans] and not d['tp']: diff_ans.append({'code':code,'stem':stem,'new':opts[ans],'old':o['options'][o['answer']],'oldId':o['id']})
        if d['tp'] and o.get('image'): q['image']=o['image']
        if not q['explanation']: q['explanation']=o['explanation']
    else: new.append(code)
    if d['tp'] and 'image' not in q and code in FILL: q.update(FILL[code])
    if d['tp'] and 'image' not in q:
        missing_img.append({'code':code,'tp':d['tp'],'url':'https://tkimg.mnks.cn/i/'+d['tp'].rsplit('.',1)[0]+'.webp/ybjk','stem':stem}); continue
    q['source']=f"https://www.ybjk.com/tiku/{code}.htm"
    out.append(q)
oldonly=[q for q in old['questions'] if q['id'] not in matched_old]
bank={'version':'mnks-2026103002','name':'摩托车科目一（全国题 + 浙江地方题）','source':'元贝驾考/驾校一点通(jsyks) 公开网页 tkdata.mnks.cn，题库版本 2026103002，抓取于 2026-11-03','count':len(out),'questions':out}
json.dump(bank,open(f'{R}/out/bank.json','w'),ensure_ascii=False,indent=1)
rep={'national_codes':len(codes_nat),'zj_codes':len(codes_zj),'absent':absent,'in_bank':len(out),'types':collections.Counter(q['type'] for q in out),
 'chapters':collections.Counter(q['chapter'] for q in out),'new_vs_old':len(new),'old_matched':len(matched_old),'old_only':len(oldonly),
 'answer_diff':diff_ans,'missing_image':len(missing_img),'no_expl':sum(1 for q in out if not q['explanation'])}
json.dump({'report':rep,'missing_image':missing_img,'old_only':oldonly},open(f'{R}/out/diff.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(rep,ensure_ascii=False,indent=1)[:3000])
