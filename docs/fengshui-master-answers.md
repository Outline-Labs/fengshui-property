# Fengshui Master Questions — Researched Working Answers

Status: working research answer, not a substitute for the master's lineage rules.

Main correction: the current inference in `fengshui-master-confirmation.md` for
卦運 is wrong. The source table itself and external Xuan Kong Da Gua tables agree
that examples such as 风天小畜, 地山谦, 水山蹇 are 卦运八、六、二 respectively,
not 八、九、三.

References used:
- Local source scan: `Fengshui Source/B — 24-mountain → hexagram table (with the index numbers).jpeg`
- Local implementation table: `src/lib/fengshui/dagua-source.ts`
- Xuan Kong Da Gua 60-jiazi table: https://www.ygkyfs.com/a/ziliaofenxiang/2021/0605/18791.html
- Xuan Kong Da Gua gua number / star number calculation: https://tw888.pixnet.net/blog/post/47253625
- Xuan Kong Da Gua gua qi / gua yun explanation: https://www.zhanbugua.com/archives/2134
- Luopan/Xuan Kong Da Gua layer explanation: https://metaphysics01.com/posts/d21e1d87d/
- Flying-star 5-yellow direction rule: https://www.36fengshui.com/zhishi/zs29.asp and https://www.sohu.com/a/273590242_435999

## A. 卦運

Answer: the inferred rule `卦運 = 10 - 上卦后天数` is wrong.

Correct working rule:

```text
卦气数 / indexTop = 外卦先天配洛书数 * 10 + 内卦先天配洛书数

卦运数 = 归藏(外卦, 内卦) 的先天配洛书数
归藏逐爻比较：上下同阴/同阳 -> 阴；阴阳不同 -> 阳
```

Equivalent code form: if trigram lines use `1=yang, 0=yin`, then
`卦运 = XT_LS[upper XOR lower]`.

Examples:
- 风天小畜: 巽(011) XOR 乾(111) = 震(100), 震 = 8, so 卦运八.
- 地山谦: 坤(000) XOR 艮(001) = 艮(001), 艮 = 6, so 卦运六.
- 水山蹇: 坎(010) XOR 艮(001) = 巽(011), 巽 = 2, so 卦运二.
- 山泽损: 艮(001) XOR 兑(110) = 乾(111), 乾 = 9, so 卦运九.

Justification:
- The local source image prints the Chinese 卦运 digit beside each hexagram.
- The external table lists `丁巳 | 2 | 风天小畜 | 8`, `戊戌 | 1 | 地山谦 | 6`, and `甲戌 | 7 | 水山蹇 | 2`.
- The luopan explanation explicitly says 卦运数 is obtained through 归藏, then converted to the corresponding 洛书数.

## Q2. `indexBottom`

Answer: `indexBottom` is not "lower trigram index". Its tens digit is 卦运/挨星.

What is solved:
- `indexTop`: 外卦卦气 + 内卦卦气.
- `Math.floor(indexBottom / 10)`: 卦运数 from 归藏.

What is not yet solved:
- `indexBottom % 10` is systematic but not identified. It is not simply 内卦,
  外卦, 八宫宫位, 互卦下卦, 元神 branch, or a direct shifted line relation.

Plan to settle the ones digit:
1. Ask the master specifically: "第二行个位数是什么层？是否为抽爻换象/珠宝分金/父母元卦/另一卦气层？"
2. Get a higher-resolution photo of the luopan/table including the ring labels immediately inside/outside the two numeric rows.
3. Test the named answer against all 64 values. The current check should require 64/64 exact matches before wiring it into code.

## B. 旺 / 衰

Answer: "旺 = 卦运 == 当前大运" is too narrow.

Working rule:
- 当前 date is 2026-06-05, so we are in 九运 under the usual 2024-2043 三元九运 convention.
- For Xuan Kong Da Gua, 当令九 is strongest.
- More generally, 下元 uses 6,7,8,9 as 合元/可用, while 1,2,3,4 are 上元 and are not the same class in 九运.
- For high-confidence interpretation, consider both 卦气 and 卦运. A direction with only one matching layer is weaker/partial.

Justification:
- Xuan Kong Da Gua references distinguish 卦气 and 卦运 and say both should 合元; one source states 下元 requires 6,7,8,9, while 1,2,3,4 are treated as 零正颠倒 for 下元.

## C. 正神 / 零神

Answer: partly correct, but incomplete.

For broad 三元/大玄空 language:
- 九运正神 is 九/离/南.
- 九运零神 is 一/坎/北, the 合十 opposite.

For the 64-gua engine:
- Do not define 正神/零神 from `卦运` alone.
- Use 卦气 plus 卦运, and the role of the observed thing: 来龙、坐山、出向、收水/水口.

Justification:
- External sources state 正神 takes the current旺神 and 零神 takes the not-current/opposite spirit.
- Xuan Kong Da Gua sources add that 出向、来龙、收峰 need both 上卦/卦气 and 卦运 to be considered.

## D. 山 / 水

Answer: the slogan is directionally correct, but the document's implementation interpretation is too simple.

Correct working rule:
- 正神宜山/实/静.
- 零神宜水/低/动.
- But "mountain" and "water" are form-school observations: real landform, road/water movement, open/low space, building mass, and the role of the sector.

Why the 小畜 example conflicts:
- The handwritten "山/水" marks are field observations around the flat, not just a table lookup from period number.
- Therefore the engine should first tag actual form (`mountain/mass/static`, `water/open/moving`) by sector, then compare it against the relevant 正/零/卦气/卦运 rule.

## E. 财位

Answer: "财位 = 一运/零神方" is too narrow.

Working rule:
- In 九运, 零神一/坎/北见水 is a classical wealth condition.
- But wealth is not simply every 卦运一 sector. For Xuan Kong Da Gua, wealth depends on water/open/moving form, water mouth/facing relationship, and 卦气/卦运 combinations such as 同元、一卦纯清、合十、生成.

Justification:
- Xuan Kong Da Gua sources describe 龙山向水 pairing and require 卦气/卦运 relationships, not a single period-number lookup.

## F. Door / Stove / Bed / Toilet

Answer: partly correct, but should be split by object.

Working rule:
- Door: prefer 旺/生气/usable qi because it is the main 气口.
- Bed: prefer 山星/静/health-person sector, not just wealth/water rules.
- Stove: important, but classical rules often treat stove as "坐煞向吉" or require mouth/direction handling; do not reduce it to "place in 旺方".
- Toilet: generally acceptable in 衰/凶方 and should avoid 正神/旺财/central sectors, but the reason should be "污水/泄气/压凶", not only "flushes wealth".

Justification:
- 阳宅三要 treats 门、主/床、灶 as separate controls.
- Common 八宅/阳宅 sources say toilet is suitable in 四凶方 to suppress凶, while door/bed/stove need auspicious treatment.

## G. 明堂

Answer: no reliable fixed 1.5x rule was found.

Working rule:
- 明堂 should be open, bright, clean, flat, and proportionate to the building/door.
- It should allow qi to gather before entering, not rush straight in or be blocked by a wall/pole/sharp corner.
- Keep `~1.5x door width` only as an internal UX heuristic if needed, not as a fengshui rule.

Plan to settle:
1. Ask master whether he uses a Lu Ban/ruler-based minimum, a proportional rule, or a purely form-school judgment.
2. Collect 5-10 floorplan examples marked by the master and fit practical thresholds from those examples.

## H. 五黄入中顺逆

Answer: the current implementation is close but should be expressed in 24-mountain terms.

Correct working rule:
- 五黄 itself has no fixed trigram/yin-yang.
- When the 山星 or 向星 number is 5, determine 顺/逆 from the relevant 山/向's 三元龙阴阳 or from the same-yuan mountain of the palace used for立极.
- In an 8-direction simplified engine, this is approximately "borrow the sitting/facing palace polarity"; in a production 24-mountain engine, use the exact 山向 and 天/地/人元龙.

Justification:
- Flying-star sources state that 5 has no yin-yang of its own; when it appears, the rule borrows the relevant mountain/same-yuan palace to decide 顺逆.

## Shipping Impact

Must fix before shipping:
- Replace `guaYun()` and all dependent tests/data assumptions.
- Do not mark 九运 wealth/wang from `10 - upper` or from `卦运 == 9` only.

Can ship behind cautious labels:
- 卦气/indexTop.
- 卦运 from 归藏.
- Broad 正神山/零神水 as a form-plus-formula comparison.
- 五黄入中 rule if the engine captures 24 mountains; otherwise label the 8-direction version as simplified.

Still needs master/source confirmation:
- `indexBottom` ones digit.
- Exact 明堂 proportional standard, if any.
- The master's preferred weighting for 6/7/8/9 in 九运.
