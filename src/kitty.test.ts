import { expect, test } from "bun:test";

import { encodeKittyPng } from "./kitty";

test("encodeKittyPng emits delete and transmit escapes", () => {
  const output = encodeKittyPng("abcd", {
    imageId: 7,
    columns: 80,
    rows: 24,
  });

  expect(output).toContain("\x1b_Ga=d,i=7,q=2\x1b\\");
  expect(output).toContain("\x1b_Ga=T,f=100,t=d,i=7,m=0,q=2,c=80,r=24;abcd\x1b\\");
});

test("encodeKittyPng can transmit without deleting previous image", () => {
  const output = encodeKittyPng("abcd", {
    imageId: 7,
    deletePrevious: false,
  });

  expect(output).not.toContain("\x1b_Ga=d,i=7,q=2\x1b\\");
  expect(output).toContain("\x1b_Ga=T,f=100,t=d,i=7,m=0,q=2;abcd\x1b\\");
});
