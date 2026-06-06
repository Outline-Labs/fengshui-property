# 玄空大卦引擎 — 待师傅确认的推断规则
# Xuan Kong Da Gua engine — rules pending the master's confirmation

We reconstructed the rules below from your luopan and source charts. Each one is
**internally consistent** (it passes the classical cross-checks — see notes) but
**inferred** — we worked it out, you have not yet confirmed it. Until you do,
none of this reaches users: it stays gated in the code.

Please mark each **✅ correct** / **❌ wrong (with the right rule)** / **🤔 partly**.
The item marked ⚠️ is the one we most suspect is wrong — your own marked-up example
seems to contradict it.

下列规则是我们根据师傅的罗盘与图表反推出来的。每一条都通过了古法自洽检验（见备注），
但都属于**推断**，尚未经师傅确认。确认之前，引擎不会把这些结论展示给用户。
请逐条标注：**✅ 正确** ／ **❌ 错误（并给出正确规则）** ／ **🤔 部分正确**。
标 ⚠️ 的那条最可疑 —— 师傅亲手标注的例子似乎与它矛盾。

---

## A. 卦運 (the "luck period" of each hexagram) — ✅ RESOLVED 2026-06

> **结论：卦運 用「归藏」生成，不是 10 − 上卦数，也不是合十。** 地山谦 = 6。
> 引擎 (`dagua.guaYun()`) 已改用归藏法。
>
> 归藏：两卦逐爻比较，同爻為陰(0)、異爻為陽(1)（即 XOR）→ 得一卦 → 取其先天配洛书数。
> 例：地山谦 = 坤(000) ⊕ 艮(001) = 艮(001) → 6。合十 只是「关系/成局/校验」，不是生成公式。
>
> **重要发现 / Key finding:** 我们手抄的源图表 B 里那一列「卦運」数字，其实**不是**归藏卦運
> ——它符合另一套（合十型）口诀，与归藏在 56/64 卦上不同（例：山泽损，源图列 4，归藏 9）。
> 所以 `dagua-source.ts` 里的 `guaYun` 字段已标注为「源图原始记录，非引擎卦運」，仅作存证，不参与计算。
> 早先把地山谦改成 9 的「OCR 修正」是基于错误规则，已撤销。
>
> 仍待师傅确认：水山蹇 源图记录是 7（归藏给 2）——源图该列既非归藏，这个差异不影响引擎，
> 但若要弄清源图那列到底是什么口诀，可一并请教。

*(Original inferred rule below — kept for the record. It was wrong.)*

**推断规则 / Inferred rule (WRONG — superseded by 归藏 above):**
> 卦運 = 10 − M(上卦)，其中 M = 该卦先天卦位的「后天数」：
> 乾 9 · 兑 4 · 离 3 · 震 8 · 巽 2 · 坎 7 · 艮 6 · 坤 1。

**例 / Examples:**
- 风天小畜（上卦 巽 = 2）→ 卦運 = 10 − 2 = **8**
- 地山谦（上卦 坤 = 1）→ 卦運 = 10 − 1 = **9**
- 水山蹇（上卦 坎 = 7）→ 卦運 = 10 − 7 = **3**

*备注：此规则下，全部 64 卦的 卦運 都落在 1–9，且每个数字恰好出现 8 次；错卦（180°对宫）成对，卦運 合十（相加为 10）。两处与师傅手稿不符的值（地山谦、水山蹇），按此规则修正后才自洽 —— 我们怀疑手稿是抄写笔误。*

> **Q1.** 「卦運 = 10 − 上卦的后天数」这个规则对吗？
> **Q2.** 我们另外反推出一个「索引码 = 上卦数 × 10 + 下卦数」。下卦那一位（indexBottom）我们还没解出，它代表什么？

---

## B. 旺 / 衰 (timeliness — is a direction "in power" now?)

**推断规则:** 當令為旺 —— 一个方位的卦，其 卦運 等于当前大運（现在是九運）时为 **旺**；否则为 **衰**。

> **Q3.** 对吗？是严格「卦運 == 當運」才算旺，还是有「生、旺、退、死」的区间（例如八運、一運也算可用）？

---

## C. 正神 / 零神

**推断规则:** 正神 = 卦運 == 當運（九運）；零神 = 卦運 == 10 − 當運（即一運，与當運合十）；其余为退氣/不當令。

> **Q4.** 九運下，正神 / 零神 这样定对吗？

---

## D. ⚠️ 山 / 水 的要求（最需要确认）

**推断规则:** 正神方宜见山（山管人丁）；零神方宜见水（水管财）。

**问题 / The conflict:** 在师傅那张 **风天小畜** 的工作示例上，您手写标注的「山 / 水」（看来是实地峦头观察）**并不能干净地**对应到上面这套 旺衰 推断。也就是说，山水的摆放似乎遵循的是另一套原则，而不是「正神山、零神水」。

> **Q5.** 「正神见山、零神见水」是正确的规则吗？还是说山水的判断另有依据（实地峦头？城门诀？其他）？**这一条是我们最需要厘清的。**

---

## E. 财位 (wealth directions)

**推断规则:** 财位 = 卦運为一運（零神 / 与當運合十）的那些方位。

> **Q6.** 对吗？

---

## F. 摆放 (placement of door / stove / bed / toilet)

**推断规则:**
- 大门、灶、床 宜在 **旺**（九運）方；
- 厕所 **相反** —— 宜在 **衰** 方（因为冲走一个旺方等于冲走财气）。

> **Q7.** 对吗？尤其是「厕所宜在衰方」这个反向规则。

---

## G. 明堂 (the open space before the door)

**推断规则:** 明堂的进深约为门面宽度的 ~1.5 倍为佳。

> **Q8.** 有没有一个标准的比例 / 尺寸口诀？我们现在这个 1.5 倍只是猜的。

---

## H. 飞星「五黄入中」的顺逆（独立问题，属玄空飞星，非大卦）

**推断规则:** 当 5（五黄）作为运星/山星/向星入中宫时，它借所入宫位的阴阳来定顺飞 / 逆飞。

> **Q9.** 各派对此说法不一。师傅的规矩是：五黄入中时如何定顺逆飞？

---

## 一句话汇总 / One-line summary for each

| # | 规则 Rule | 确认 Confirm |
|---|---|---|
| A | 卦運 = 10 − 上卦后天数 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| B | 旺 = 卦運 == 當運 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| C | 正神=當運, 零神=合十 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| D | ⚠️ 正神山 / 零神水 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| E | 财位 = 零神(一運)方 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| F | 门灶床旺方 / 厕所衰方 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| G | 明堂 ~1.5× 门宽 | ☐ ✅  ☐ ❌  ☐ 🤔 |
| H | 五黄入中顺逆 | ☐ ✅  ☐ ❌  ☐ 🤔 |

Once these are confirmed, we wire the rules into the engine and the deep Da Gua
reading goes live. Confirm A–C+E–F and we can ship the bulk; D and H are the two
that genuinely block us today.

确认 A–C、E–F 我们就能上线大部分；D 和 H 是目前真正卡住我们的两点。
