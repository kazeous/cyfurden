export const faceboothCameraPresets = {
  FRONT: { position: [0, 0.13, 0.42], target: [0, 0.08, 0] },
  THREE_QUARTER: { position: [0.28, 0.2, 0.34], target: [0, 0.08, 0] },
  SIDE: { position: [0.42, 0.13, 0], target: [0, 0.08, 0] },
  TOP: { position: [0, 0.5, 0.08], target: [0, 0.08, 0] },
} as const;

export type FaceboothCameraPreset = keyof typeof faceboothCameraPresets;
export const faceboothBackgroundModes = [
  "STUDIO",
  "SOLID",
  "GRADIENT",
  "TRANSPARENT",
] as const;
export type FaceboothBackgroundMode = (typeof faceboothBackgroundModes)[number];

export function supportsFaceboothWebGl2(
  documentValue: Pick<Document, "createElement"> = document,
) {
  try {
    const canvas = documentValue.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }),
    );
  } catch {
    return false;
  }
}
