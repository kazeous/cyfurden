import type { WorkspaceCatalogue } from "./workspace";

export function localizeGachaCompilationError(
  error: string,
  strings: WorkspaceCatalogue["gacha"],
  localizeContent: (value: string) => string = (value) => value,
) {
  const exact = new Map([
    ["Save the game setup before publishing.", strings.compileSetup],
    [
      "Enable the free game in Game setup before publishing.",
      strings.compileEnable,
    ],
    [
      "Save a complete odds table whose four tiers total 100%.",
      strings.compileOdds,
    ],
    [
      "Include at least one reward banner in the published game.",
      strings.compileBanner,
    ],
    [
      "Finish the required game copy, odds, and guarantee settings.",
      strings.compileCopy,
    ],
  ]);
  const direct = exact.get(error);
  if (direct) return direct;

  const titleOnlyPatterns: Array<[RegExp, (localizedTitle: string) => string]> =
    [
      [
        /^(.*) needs at least one reveal in its lineup\.$/,
        strings.compileLineup,
      ],
      [
        /^(.*) needs both a start and end date, or neither\.$/,
        strings.compileDates,
      ],
      [/^(.*) must end after it starts\.$/, strings.compileDateOrder],
    ];
  for (const [pattern, format] of titleOnlyPatterns) {
    const match = pattern.exec(error);
    if (match?.[1]) return format(localizeContent(match[1]));
  }

  const rarityNames: Record<string, string> = {
    common: strings.common.toLocaleLowerCase(),
    rare: strings.rare.toLocaleLowerCase(),
    epic: strings.epic.toLocaleLowerCase(),
    legendary: strings.legendary.toLocaleLowerCase(),
  };
  const rarityMatch =
    /^(.*) needs a (.*) reveal because that tier has non-zero odds\.$/.exec(
      error,
    );
  if (rarityMatch?.[1] && rarityMatch[2]) {
    return strings.compileRarity(
      localizeContent(rarityMatch[1]),
      rarityNames[rarityMatch[2]] ?? rarityMatch[2],
    );
  }
  const guaranteeMatch =
    /^(.*) needs an eligible (.*)-or-better reveal for the guarantee\.$/.exec(
      error,
    );
  if (guaranteeMatch?.[1] && guaranteeMatch[2]) {
    return strings.compileGuarantee(
      localizeContent(guaranteeMatch[1]),
      rarityNames[guaranteeMatch[2]] ?? guaranteeMatch[2],
    );
  }
  return error;
}
