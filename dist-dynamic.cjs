"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// test-esbuild-dep.js
var test_esbuild_dep_exports = {};
__export(test_esbuild_dep_exports, {
  x: () => x
});
var x;
var init_test_esbuild_dep = __esm({
  "test-esbuild-dep.js"() {
    "use strict";
    x = 42;
  }
});

// test-esbuild-dynamic.js
var test_esbuild_dynamic_exports = {};
__export(test_esbuild_dynamic_exports, {
  run: () => run
});
module.exports = __toCommonJS(test_esbuild_dynamic_exports);
async function run() {
  const { x: x2 } = await Promise.resolve().then(() => (init_test_esbuild_dep(), test_esbuild_dep_exports));
  console.log(x2);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  run
});
