const names = [
  "West Gate Surge",
  "Conflicting Smoke Reports",
  "Multilingual Medical Incident",
  "Accessible Corridor Blockage",
  "False Duplicate Challenge",
];
const seed = Number(process.argv[2] ?? 2026);
const index = Math.abs(seed) % names.length;

console.log(
  JSON.stringify(
    {
      id: `scenario-${index + 1}`,
      name: names[index],
      seed,
      generatedAt: new Date(0).toISOString(),
      note: "Use this stable descriptor with the executable events in data/scenarios.",
    },
    null,
    2,
  ),
);
