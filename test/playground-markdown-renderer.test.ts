import test from "node:test";
import assert from "node:assert/strict";
import { renderPlaygroundMarkdown } from "../src/ui/playground.js";

test("renderPlaygroundMarkdown renders safe markdown html for transcript messages", () => {
	const html = renderPlaygroundMarkdown(
		[
			"# Title",
			"",
			"- one",
			"- two",
			"",
			"**bold** and `code` and [link](https://example.com)",
			"",
			"> quote",
			"",
			"```ts",
			"const value = 1 < 2;",
			"```",
			"",
			"<script>alert(1)</script>",
		].join("\n"),
	);

	assert.match(html, /<h1>Title<\/h1>/);
	assert.match(html, /<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
	assert.match(html, /<strong>bold<\/strong>/);
	assert.match(html, /<code>code<\/code>/);
	assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noreferrer noopener">link<\/a>/);
	assert.match(html, /<blockquote>\s*<p>quote<\/p>\s*<\/blockquote>/);
	assert.match(html, /<pre><code class="language-ts">const value = 1 &lt; 2;\s*<\/code><\/pre>/);
	assert.doesNotMatch(html, /<script>/);
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("renderPlaygroundMarkdown keeps fenced code blocks visible when preceded by plain text", () => {
	const html = renderPlaygroundMarkdown(["闂佺懓鐏堥崑鎾绘煠瀹曞洦娅曠紒顔哄姂瀵悂宕熼崜浣虹崶", "```json", '{ "name": "web-access" }', "```"].join("\n"));

	assert.match(html, /<p>闂佺懓鐏堥崑鎾绘煠瀹曞洦娅曠紒顔哄姂瀵悂宕熼崜浣虹崶<\/p>/);
	assert.match(html, /<pre><code class="language-json">\{ &quot;name&quot;: &quot;web-access&quot; \}\s*<\/code><\/pre>/);
	assert.doesNotMatch(html, /CODEBLOCK0/);
});

test("renderPlaygroundMarkdown renders pipe tables as html tables", () => {
	const html = renderPlaygroundMarkdown(
		[
			"???? Markdown ?????",
			"",
			"| ?? | ?? NoSuchMethodError?|",
			"|------|------------------------|",
			"| catch (Exception e) | 闂?婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾惧鏌ｉ幇顒佹儓闁搞劌鍊块弻娑㈩敃閿濆棛顦ョ紓浣哄С閸楁娊寮诲☉妯锋斀闁告洦鍋勬慨銏ゆ⒑濞茶骞楅柟鐟版喘瀵鏁愭径濠勵吅闂佹寧绻傚Λ顓炍涢崟顓犵＝濞达絾褰冩禍?|",
			"| catch (Error e) | 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾圭€瑰嫭鍣磋ぐ鎺戠倞闁靛ě鍛獎闂備礁澹婇崑鍛紦妤ｅ啫鍑犵€广儱顦伴悡娑㈡煕閵夛絽鍔氶柣蹇婃櫊閺屾盯骞嬮悩娴嬫瀰闂佸搫琚崐鏍箞閵娾晛绠涙い鎴ｆ娴滈箖鏌″搴″伎缂傚秵鐗犻弻锟犲炊閳轰焦鐏佺紓浣叉閸嬫捇姊婚崒姘偓鎼佹偋婵犲嫮鐭欓柟鐑樻尭缁剁偤鏌涢弴銊ヤ簮闁衡偓閼恒儯浜滈柡宥冨妿閳洟鎮樿箛銉х暤闁哄矉绱曟禒锕傚礈瑜庨崚娑㈡⒑缁洘娅呴悗姘緲閻ｅ嘲顫滈埀顒勫春閿熺姴绀冮柣鎰靛劮閵堝鈷掗柛灞剧懄缁佹壆鈧娲滈弫璇茬暦娴兼潙绠涙い鏃囨鎼村﹪姊洪崜鎻掍簴闁稿酣浜堕幏鎴︽偄閸忚偐鍘介梺鍝勫暙閸婂摜鏁崜浣虹＜闁绘ê鍟垮ù顕€鏌″畝鈧崰鏍箖濠婂吘鐔兼惞闁稒妯婂┑锛勫亼閸娿倝宕戦崟顖氱疇婵せ鍋撴鐐插暙铻栭柛鎰ㄦ櫅閺嬪倿姊洪崨濠冨闁告挻鐩棟闁靛ň鏅滈埛鎴︽煙缁嬪灝顒㈢痪鐐倐閺屾盯濡搁妷褏楔闂佽鍣ｇ粻鏍箖濠婂牊鍤嶉柕澶涢檮椤忕喖姊绘担铏瑰笡閽冭京鎲搁弶鍨殭闁伙絿鏁诲畷鍗炩槈濞嗗本瀚肩紓鍌氬€烽悞锕傚煟閵堝鏁傞柛鏇炴捣閸犳劗鎹㈠┑瀣妞ゅ繐绉电粊顐⑩攽鎺抽崐褏寰婃禒瀣柈妞ゆ牜鍋涢悡?|",
			"| catch (Throwable t) | 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾圭€瑰嫭鍣磋ぐ鎺戠倞闁靛ě鍛獎闂備礁澹婇崑鍛紦妤ｅ啫鍑犵€广儱顦伴悡娑㈡煕閵夛絽鍔氶柣蹇婃櫊閺屾盯骞嬮悩娴嬫瀰闂佸搫琚崐鏍箞閵娾晛绠涙い鎴ｆ娴滈箖鏌″搴″伎缂傚秵鐗犻弻锟犲炊閳轰焦鐏佺紓浣叉閸嬫捇姊婚崒姘偓鎼佹偋婵犲啰鐟规俊銈呮噹绾惧潡鐓崶銊︾缁炬儳銈搁弻锝呂熼崫鍕瘣闂佸磭绮ú鐔煎蓟閿涘嫪娌柣鎰靛墰椤︺劎绱撴担铏瑰笡闁烩晩鍨伴悾鐤亹閹烘繃鏅╃紒鐐娴滎剟鍩€椤掆偓绾绢厾妲愰幘璇茬＜婵炲棙甯╅崬褰掓⒑?|",
			"| catch (NoSuchMethodError e) | 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾圭€瑰嫭鍣磋ぐ鎺戠倞闁靛ě鍛獎闂備礁澹婇崑鍛紦妤ｅ啫鍑犵€广儱顦伴悡娑㈡煕閵夛絽鍔氶柣蹇婃櫊閺屾盯骞嬮悩娴嬫瀰闂佸搫琚崐鏍箞閵娾晛绠涙い鎴ｆ娴滈箖鏌″搴″伎缂傚秵鐗犻弻锟犲炊閳轰焦鐏佺紓浣叉閸嬫捇姊婚崒姘偓鎼佹偋婵犲嫮鐭欓柟鐑樻尭缁剁偤鏌涢弴銊ヤ簮闁衡偓閼恒儯浜滈柡宥冨妿閳洟鎮樿箛銉х暤闁哄矉绱曟禒锕傚礈瑜庨崚娑㈡⒑缁洘娅呴悗姘緲閻ｅ嘲顫滈埀顒勫极閸屾粍宕夐柕濞垮€楅悷婵嗏攽閻樺灚鏆╅柛瀣洴閹椽濡歌閸ㄦ繈鏌涢鐘插姎缁绢厸鍋撻梻浣筋潐閸庣厧螞閸曨垱瀚呴柣鏂挎憸缁犻箖鏌熺€电浠ч柣顓炵焸閺岋綁濡堕崒姘婵犵數濮甸鏍窗濡ゅ懏鏅濋柍鍝勬噹閻鏌嶈閸撶喖寮诲☉姗嗘僵妞ゆ巻鍋撻柍褜鍓濆畷闈浳?|",
			"",
			"---",
		].join("\n"),
	);

	assert.match(html, /<p>.*Markdown.*<\/p>/);
	assert.match(html, /<table>/);
	assert.match(html, /<thead>\s*<tr>\s*<th>.*<\/th>\s*<th>.*NoSuchMethodError.*<\/th>\s*<\/tr>\s*<\/thead>/);
	assert.match(html, /<tbody>/);
	assert.match(html, /<td>catch \(Throwable t\)<\/td>\s*<td>.*<\/td>/);
	assert.match(html, /<hr>/);
	assert.doesNotMatch(html, /\|------\|/);
});
