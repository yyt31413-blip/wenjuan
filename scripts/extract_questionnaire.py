"""从原文提取题库；运行时传入问卷 docx 路径。保留原始题干和选项文字。"""
import json, re, sys, hashlib
from zipfile import ZipFile
from pathlib import Path
from xml.etree import ElementTree as ET
root=Path(__file__).resolve().parents[1]
with ZipFile(sys.argv[1]) as z:
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    xml=ET.fromstring(z.read('word/document.xml'))
    lines=[''.join(p.itertext()) for p in []]
    lines=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in xml.findall('.//w:p',ns)]
    image=z.read('word/media/image1.png')
    (root/'public/images/image1.png').write_bytes(image)
questions=[]
for i,line in enumerate(lines):
    m=re.match(r'^([ABCD]\d{2})[\s．]+(.+)',line)
    if not m: continue
    qid,title=m.groups()
    q={'id':qid,'title':title.strip(),'section':{'A':'参与者背景','B':'日常使用中的实际表现','C':'主观判断','D':'后续参与'}[qid[0]],'multiple':qid in ['A05','C02','C06']}
    if qid.startswith('B'):
        q['options']=[{'value':v,'label':t} for v,t in zip(['1','2','3','4','5','X'],['完全不符合','较不符合','部分符合','较符合','完全符合','难以判断或无相关经历'])]
    elif qid=='C03': q['options']=next(x['options'] for x in questions if x['id']=='C02')
    else:
        option_lines=[]
        for s in lines[i+1:]:
            if re.match(r'^[ABCD]\d{2}',s): break
            if re.match(r'^(?:□\s*)?[A-H][\s．]',s.strip()): option_lines.append(s)
        raw=' '.join(option_lines).replace('□','')
        matches=list(re.finditer(r'(?:^|\s+)([A-H])\s{2,}|([A-H])．',raw))
        q['options']=[{'value':m.group(1) or m.group(2),'label':raw[m.end():matches[j+1].start() if j+1<len(matches) else len(raw)].strip()} for j,m in enumerate(matches)]
    if qid in ['A04','A05','C02']: q['otherValue']='H' if qid=='C02' else 'E'
    if qid=='C02': q['maxChoices']=3
    if qid=='A05': q['exclusiveValue']='F'
    if qid=='A01': q['required']=True
    if qid=='C01': q['image']='/images/image1.png'
    questions.append(q)
assert len(questions)==42
assert all(len(q['options'])>0 for q in questions)
out={'title':lines[0],'intro':[x for x in lines[1:5] if x.strip()],'behaviorHint':next(x for x in lines if x.startswith('根据最近一个月')),'closing':lines[-1], 'photoSha256':hashlib.sha256(image).hexdigest(),'questions':questions}
(root/'src/data').mkdir(parents=True,exist_ok=True)
(root/'src/data/questionnaire.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print('Extracted',len(questions),'questions; option counts:',[(q['id'],len(q['options'])) for q in questions if not q['id'].startswith('B')])
