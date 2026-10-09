import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/detect.ts"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "node",
});
const { detect } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

test("classifies an email without changing ordinary text", () => {
  const findings = detect("Contact alex@example.com. This is normal.");
  assert.deepEqual(
    findings.map(({ type, severity, text }) => ({ type, severity, text })),
    [{ type: "Email", severity: "medium", text: "alex@example.com" }],
  );
});

test("classifies a password and an API key as high sensitivity", () => {
  const findings = detect(
    "password = DemoPass123! sk-proj-FAKEEXAMPLEKEY1234567890",
  );
  assert.deepEqual(
    findings.map((item) => item.type),
    ["Password", "API key"],
  );
  assert.ok(findings.every((item) => item.severity === "high"));
});

test("filtering a disabled category still finds enabled matches inside its span", () => {
  const findings = detect(
    "password = sk-proj-FAKEEXAMPLEKEY1234567890",
    (item) => item.type !== "Password",
  );
  assert.deepEqual(
    findings.map((item) => item.type),
    ["API key"],
  );
});

test("detects full names and context-labeled single names as personal information", () => {
  const findings = detect(
    "Olivia Chen met Juan Dela Cruz and Maria dela Cruz. Name: Maya. Dear Ana,",
  );
  assert.deepEqual(
    findings
      .filter((item) => item.type === "Personal name")
      .map((item) => item.text),
    ["Olivia Chen", "Juan Dela Cruz", "Maria dela Cruz", "Maya", "Ana"],
  );
  assert.ok(
    findings
      .filter((item) => item.type === "Personal name")
      .every((item) => item.severity === "medium"),
  );
});

test("does not treat ordinary page labels and street names as people", () => {
  const findings = detect(
    "Visible Text appears on Oak Street in New York. This is normal.",
  );
  assert.equal(
    findings.filter((item) => item.type === "Personal name").length,
    0,
  );
});

test("personal information category can exclude name findings", () => {
  const findings = detect(
    "Olivia Chen uses alex@example.com",
    (item) => item.type !== "Personal name",
  );
  assert.deepEqual(
    findings.map((item) => item.type),
    ["Email"],
  );
});

test("strictly rejects consecutive capitalized UI labels, buttons, and tech terms", () => {
  const sample =
    "Click Submit Button on Next Page. Read Terms Of Service and Privacy Policy. Built with Artificial Intelligence and Local Storage in San Francisco.";
  const names = detect(sample).filter((item) => item.type === "Personal name");
  assert.equal(names.length, 0);
});

test("detects multicultural and professional titled names accurately", () => {
  const sample =
    "Meeting with Dr. Michael Brown and Engr. Andres Bonifacio. Patient: Sarah Connor. Signed by: David Wilson.";
  const names = detect(sample)
    .filter((item) => item.type === "Personal name")
    .map((n) => n.text);
  assert.deepEqual(names, [
    "Michael Brown",
    "Andres Bonifacio",
    "Sarah Connor",
    "David Wilson",
  ]);
});

test("rejects common sentence starters from being falsely flagged as names", () => {
  const sample =
    "However we observed the behavior. Because of this setting, please verify the result. Visible changes will appear.";
  const names = detect(sample).filter((item) => item.type === "Personal name");
  assert.equal(names.length, 0);
});

test("instantly detects street addresses in text without delay", () => {
  const sample = "Olivia Chen lives at 123 Oak Street in sample city.";
  const findings = detect(sample);
  const addresses = findings.filter((f) => f.type === "Street address");
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0].text, "123 Oak Street");
});

