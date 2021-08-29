// Copyright 2021 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This file excercises basic fast API calls and enables fuzzing of this
// functionality.

// Flags: --turbo-fast-api-calls --allow-natives-syntax --opt
// --always-opt is disabled because we rely on particular feedback for
// optimizing to the fastest path.
// Flags: --no-always-opt
// The test relies on optimizing/deoptimizing at predictable moments, so
// it's not suitable for deoptimization fuzzing.
// Flags: --deopt-every-n-times=0

assertThrows(() => d8.test.FastCAPI());
const fast_c_api = new d8.test.FastCAPI();

// ----------- add_all -----------
// `add_all` has the following signature:
// double add_all(bool /*should_fallback*/, int32_t, uint32_t,
//   int64_t, uint64_t, float, double)

const max_safe_float = 2**24 - 1;
const add_all_result = -42 + 45 + Number.MIN_SAFE_INTEGER + Number.MAX_SAFE_INTEGER +
  max_safe_float * 0.5 + Math.PI;

function add_all(should_fallback = false) {
  return fast_c_api.add_all(should_fallback,
    -42, 45, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER,
    max_safe_float * 0.5, Math.PI);
}

%PrepareFunctionForOptimization(add_all);
assertEquals(add_all_result, add_all());
%OptimizeFunctionOnNextCall(add_all);

if (fast_c_api.supports_fp_params) {
  // Test that regular call hits the fast path.
  fast_c_api.reset_counts();
  assertEquals(add_all_result, add_all());
  assertOptimized(add_all);
  assertEquals(1, fast_c_api.fast_call_count());
  assertEquals(0, fast_c_api.slow_call_count());

  // Test fallback to slow path.
  fast_c_api.reset_counts();
  assertEquals(add_all_result, add_all(true));
  assertOptimized(add_all);
  assertEquals(1, fast_c_api.fast_call_count());
  assertEquals(1, fast_c_api.slow_call_count());

  // Test that no fallback hits the fast path again.
  fast_c_api.reset_counts();
  assertEquals(add_all_result, add_all());
  assertOptimized(add_all);
  assertEquals(1, fast_c_api.fast_call_count());
  assertEquals(0, fast_c_api.slow_call_count());
} else {
  // Test that calling with unsupported types hits the slow path.
  fast_c_api.reset_counts();
  assertEquals(add_all_result, add_all());
  assertOptimized(add_all);
  assertEquals(0, fast_c_api.fast_call_count());
  assertEquals(1, fast_c_api.slow_call_count());
}

// ----------- Test add_all signature mismatche -----------
function add_all_mismatch() {
  return fast_c_api.add_all(false /*should_fallback*/,
    45, -42, Number.MAX_SAFE_INTEGER, max_safe_float * 0.5,
    Number.MIN_SAFE_INTEGER, Math.PI);
}

%PrepareFunctionForOptimization(add_all_mismatch);
const add_all_mismatch_result = add_all_mismatch();
%OptimizeFunctionOnNextCall(add_all_mismatch);

fast_c_api.reset_counts();
assertEquals(add_all_mismatch_result, add_all_mismatch());
// If the function was ever optimized to the fast path, it should
// have been deoptimized due to the argument types mismatch. If it
// wasn't optimized due to lack of support for FP params, it will
// stay optimized.
if (fast_c_api.supports_fp_params) {
  assertUnoptimized(add_all_mismatch);
} else {
  assertOptimized(add_all_mismatch);
}
assertEquals(0, fast_c_api.fast_call_count());
assertEquals(1, fast_c_api.slow_call_count());

// ----------- add_32bit_int -----------
// `add_32bit_int` has the following signature:
// int add_32bit_int(bool /*should_fallback*/, int32_t, uint32_t)

const add_32bit_int_result = -42 + 45;

function add_32bit_int(should_fallback = false) {
  return fast_c_api.add_32bit_int(should_fallback, -42, 45);
}

%PrepareFunctionForOptimization(add_32bit_int);
assertEquals(add_32bit_int_result, add_32bit_int());
%OptimizeFunctionOnNextCall(add_32bit_int);

// Test that regular call hits the fast path.
fast_c_api.reset_counts();
assertEquals(add_32bit_int_result, add_32bit_int());
assertOptimized(add_32bit_int);
assertEquals(1, fast_c_api.fast_call_count());
assertEquals(0, fast_c_api.slow_call_count());

// Test fallback to slow path.
fast_c_api.reset_counts();
assertEquals(add_32bit_int_result, add_32bit_int(true));
assertOptimized(add_32bit_int);
assertEquals(1, fast_c_api.fast_call_count());
assertEquals(1, fast_c_api.slow_call_count());

// Test that no fallback hits the fast path again.
fast_c_api.reset_counts();
assertEquals(add_32bit_int_result, add_32bit_int());
assertOptimized(add_32bit_int);
assertEquals(1, fast_c_api.fast_call_count());
assertEquals(0, fast_c_api.slow_call_count());

// ----------- Test various signature mismatches -----------
function add_32bit_int_mismatch(arg0, arg1, arg2) {
  return fast_c_api.add_32bit_int(arg0, arg1, arg2);
}

%PrepareFunctionForOptimization(add_32bit_int_mismatch);
assertEquals(add_32bit_int_result, add_32bit_int_mismatch(false, -42, 45));
%OptimizeFunctionOnNextCall(add_32bit_int_mismatch);

// Test that passing extra argument stays on the fast path.
fast_c_api.reset_counts();
assertEquals(add_32bit_int_result, add_32bit_int_mismatch(false, -42, 45, -42));
assertOptimized(add_32bit_int_mismatch);
assertEquals(1, fast_c_api.fast_call_count());
assertEquals(0, fast_c_api.slow_call_count());
%PrepareFunctionForOptimization(add_32bit_int_mismatch);

// Test that passing wrong argument types stays on the fast path.
fast_c_api.reset_counts();
let mismatch_result = add_32bit_int_mismatch(false, -42, 3.14);
assertOptimized(add_32bit_int_mismatch);
assertEquals(Math.round(-42 + 3.14), mismatch_result);
assertEquals(1, fast_c_api.fast_call_count());
assertEquals(0, fast_c_api.slow_call_count());

// Test that passing arguments non-convertible to number falls down the slow path.
fast_c_api.reset_counts();
assertEquals(0, add_32bit_int_mismatch(false, -4294967296, Symbol()));
assertUnoptimized(add_32bit_int_mismatch);
assertEquals(0, fast_c_api.fast_call_count());
assertEquals(1, fast_c_api.slow_call_count());

// Optimize again.
%OptimizeFunctionOnNextCall(add_32bit_int_mismatch);
assertEquals(add_32bit_int_result, add_32bit_int_mismatch(false, -42, 45));
assertOptimized(add_32bit_int_mismatch);

// Test that passing too few argument falls down the slow path,
// because it's an argument type mismatch (undefined vs. int).
fast_c_api.reset_counts();
assertEquals(-42, add_32bit_int_mismatch(false, -42));
assertUnoptimized(add_32bit_int_mismatch);
assertEquals(0, fast_c_api.fast_call_count());
assertEquals(1, fast_c_api.slow_call_count());

// Test that the function can be optimized again.
%PrepareFunctionForOptimization(add_32bit_int_mismatch);
%OptimizeFunctionOnNextCall(add_32bit_int_mismatch);
fast_c_api.reset_counts();
assertEquals(add_32bit_int_result, add_32bit_int_mismatch(false, -42, 45));
assertOptimized(add_32bit_int_mismatch);
assertEquals(1, fast_c_api.fast_call_count());
assertEquals(0, fast_c_api.slow_call_count());

// Test function overloads with different arity.
const add_all_32bit_int_arg1 = -42;
const add_all_32bit_int_arg2 = 45;
const add_all_32bit_int_arg3 = -12345678;
const add_all_32bit_int_arg4 = 0x1fffffff;
const add_all_32bit_int_arg5 = 1e6;
const add_all_32bit_int_arg6 = 1e8;
const add_all_32bit_int_result_4args = add_all_32bit_int_arg1 +
  add_all_32bit_int_arg2 + add_all_32bit_int_arg3 + add_all_32bit_int_arg4;
const add_all_32bit_int_result_5args = add_all_32bit_int_result_4args +
  add_all_32bit_int_arg5;
const add_all_32bit_int_result_6args = add_all_32bit_int_result_5args +
  add_all_32bit_int_arg6;

(function () {
  function overloaded_add_all(should_fallback = false) {
    let result_under = fast_c_api.overloaded_add_all_32bit_int(should_fallback,
      add_all_32bit_int_arg1, add_all_32bit_int_arg2, add_all_32bit_int_arg3,
      add_all_32bit_int_arg4);
    let result_5args = fast_c_api.overloaded_add_all_32bit_int(should_fallback,
      add_all_32bit_int_arg1, add_all_32bit_int_arg2, add_all_32bit_int_arg3,
      add_all_32bit_int_arg4, add_all_32bit_int_arg5);
    let result_6args = fast_c_api.overloaded_add_all_32bit_int(should_fallback,
      add_all_32bit_int_arg1, add_all_32bit_int_arg2, add_all_32bit_int_arg3,
      add_all_32bit_int_arg4, add_all_32bit_int_arg5, add_all_32bit_int_arg6);
    let result_over = fast_c_api.overloaded_add_all_32bit_int(should_fallback,
      add_all_32bit_int_arg1, add_all_32bit_int_arg2, add_all_32bit_int_arg3,
      add_all_32bit_int_arg4, add_all_32bit_int_arg5, add_all_32bit_int_arg6,
      42);
    let result_5args_with_undefined = fast_c_api.overloaded_add_all_32bit_int(
      should_fallback, add_all_32bit_int_arg1, add_all_32bit_int_arg2,
      add_all_32bit_int_arg3, add_all_32bit_int_arg4, undefined);
    return [result_under, result_5args, result_6args, result_over,
            result_5args_with_undefined];
  }

  %PrepareFunctionForOptimization(overloaded_add_all);
  let result = overloaded_add_all();
  assertEquals(add_all_32bit_int_result_4args, result[0]);
  assertEquals(add_all_32bit_int_result_5args, result[1]);
  assertEquals(add_all_32bit_int_result_6args, result[2]);
  assertEquals(add_all_32bit_int_result_6args, result[3]);
  assertEquals(add_all_32bit_int_result_4args, result[4]);

  fast_c_api.reset_counts();
  %OptimizeFunctionOnNextCall(overloaded_add_all);
  result = overloaded_add_all();
  assertOptimized(overloaded_add_all);

  // Only the call with less arguments goes falls back to the slow path.
  assertEquals(4, fast_c_api.fast_call_count());
  assertEquals(1, fast_c_api.slow_call_count());

  assertEquals(add_all_32bit_int_result_4args, result[0]);
  assertEquals(add_all_32bit_int_result_5args, result[1]);
  assertEquals(add_all_32bit_int_result_6args, result[2]);
  assertEquals(add_all_32bit_int_result_6args, result[3]);
  assertEquals(add_all_32bit_int_result_4args, result[4]);
})();
