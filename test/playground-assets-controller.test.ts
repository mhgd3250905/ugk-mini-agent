import assert from "node:assert/strict";
import test from "node:test";
import { getPlaygroundAssetControllerScript } from "../src/ui/playground-assets-controller.js";

test("asset library refresh only disables while the asset request is in flight", () => {
	const script = getPlaygroundAssetControllerScript();

	assert.match(script, /refreshAssetsButton\.disabled = true/);
	assert.match(script, /refreshAssetsButton\.textContent = "刷新中"/);
	assert.match(script, /finally \{\s*refreshAssetsButton\.disabled = false;\s*refreshAssetsButton\.textContent = "刷新";\s*\}/);
	assert.doesNotMatch(script, /refreshAssetsButton\.disabled = state\.loading/);
});

test("asset library exposes a delete action that calls the asset delete API", () => {
	const script = getPlaygroundAssetControllerScript();

	assert.match(script, /function deleteAssetFromLibrary\(assetId, restoreFocusElement\)/);
	assert.match(script, /fetch\("\/v1\/assets\/" \+ encodeURIComponent\(assetId\), \{\s*method: "DELETE"/);
	assert.match(script, /confirmText: "删除"/);
	assert.match(script, /state\.recentAssets = state\.recentAssets\.filter/);
	assert.match(script, /state\.selectedAssetRefs = state\.selectedAssetRefs\.filter/);
	assert.match(script, /state\.connEditorSelectedAssetRefs = state\.connEditorSelectedAssetRefs\.filter/);
});

test("asset library defers loading until first open via assetsLoadedOnce gate", () => {
	const script = getPlaygroundAssetControllerScript();

	// loadAssets sets the flag on success
	assert.match(script, /state\.assetsLoadedOnce = true/);

	// openAssetLibrary only loads if not loaded before
	assert.match(script, /if \(!state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);
});
