# 摩托车科目一刷题（moto-k1）

一个干净、无广告、移动优先的摩托车驾照（D/E/F）科目一刷题 PWA。可安装到手机桌面，离线使用。

## 功能

- **顺序练习**：按章节刷题（也可"全部题目"），每章进度自动保存；答完即显示对错与解析，答对自动跳下一题；支持左右滑动切题、题号面板跳题。
- **模拟考试**：50 题（20 单选 + 30 判断），45 分钟倒计时，每题 2 分、90 分合格；交卷前可改答案，时间到自动交卷；刷新/退出后可继续未完成的考试；交卷出分，可只看错题或全部回看答案与解析。
- **错题本**：练习和模考中答错（模考未答也算）的题自动收录；在错题本里连续答对 2 次自动移出。
- **离线可用**：Service Worker 预缓存页面、题库和全部图片，首次打开后断网也能刷新使用。
- **进度**：保存在本机 localStorage；可导出为 JSON 文件、在其他设备导入。
- 自动深色模式，适配刘海屏安全区。

## 本地运行

```bash
npm install
npm run dev        # 开发
npm test           # 单元测试（抽题规则、评分、错题移出、进度导入导出）
npm run build      # 构建到 dist/，可直接放到任意静态托管
npm run preview    # 预览构建结果（Service Worker 只在构建版生效）
npx playwright install chromium && npm run e2e   # 端到端自测 + 截图（需先 preview）
```

## 题库

> 2026-11 起：题库换为元贝驾考/驾校一点通公开网页（tkdata.mnks.cn，版本 2026103002）的全国摩托车科目一题 + 浙江地方题，共 704 题；另有 83 道图片题因图片未取得暂未收录。抓取记录见 moto-k1-research/SOURCES.md。以下为旧版说明。

| 项 | 说明 |
|---|---|
| 内容 | 摩托车科目一**全国题**，4 章共 **486 题**（单选 252、判断 234），其中 97 题带图 |
| 来源 | [BILBIL0903/UYGHUR_DATASET · resources/db/moto.db](https://github.com/BILBIL0903/UYGHUR_DATASET/blob/main/resources/db/moto.db)（该仓库说明其数据来自木仓科技"驾考宝典"维吾尔语版 APK 的摩托车题库，中文题干，数据库版本 20230614163928）|
| 图片 | 由数据库中的图片地址（jiakao-tiku.mc-cdn.cn）下载 |
| 筛选 | 只保留科目一（label_id=1）、全国通用（非地方题）的章节；地方题（天津、上海、重庆）和科目四题未收录 |

> **题库仅供学习交流，版权归原作者，侵权联系删除。** 题库可能与当前实际考试题库存在差异，考试规则以当地车管所 / 交管12123 为准。

### 数据格式与替换题库

题库与代码分开存放：`data/bank.json` + `data/img/`。

```jsonc
{
  "version": "moto-k1-20230614163928",   // 题库版本，变更后 Service Worker 会刷新缓存
  "name": "摩托车科目一（全国题）",
  "source": "https://…",                  // 来源链接（在应用内展示）
  "count": 486,
  "questions": [{
    "id": "10000300",
    "type": "single",                     // single 单选 | judge 判断（options 固定为 ["正确","错误"]）
    "stem": "驾驶机动车应当随身携带哪种证件？",
    "options": ["工作证", "驾驶证", "身份证", "职业资格证"],
    "answer": 1,                          // 正确选项下标（从 0 开始）
    "explanation": "…",
    "chapter": "驾驶证和机动车管理规定",
    "image": "img/10019600.jpg"           // 可选，相对 data/
  }]
}
```

替换方法：按上面的格式生成新的 `bank.json`（图片放 `data/img/`），修改 `version`，重新 `npm run build`。模考要求题库中至少有 20 道单选和 30 道判断。
`scripts/build-bank.py` 是从 moto.db 生成当前题库的脚本，可作参考。

## 技术栈

原生 TypeScript + Vite，无运行时依赖，构建后 JS 约 10 KB（gzip）。手写 Service Worker（`public/sw.js`，构建时注入预缓存清单）。

## 协议

代码：MIT。题库数据：版权归原作者，不在 MIT 授权范围内。
