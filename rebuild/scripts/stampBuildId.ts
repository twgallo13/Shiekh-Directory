export const BUILD_ID_PLACEHOLDER = "__BUILD_ID__";

const BUILD_ID_PATTERN = /^[0-9a-z-]+$/i;

export function createBuildId(command: string, mode: string): string {
  if (command !== "build" || mode === "test") {
    return mode === "test" ? "test" : "dev";
  }
  const time = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 10);
  return `${time}-${entropy}`;
}

export function stampServiceWorker(source: string, buildId: string): string {
  if (!BUILD_ID_PATTERN.test(buildId) || buildId.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(`Refusing to stamp sw.js with build id "${buildId}".`);
  }
  const count = source.split(BUILD_ID_PLACEHOLDER).length - 1;
  if (count !== 1) {
    throw new Error(
      `sw.js must contain the ${BUILD_ID_PLACEHOLDER} placeholder exactly once (found ${count}).`,
    );
  }
  const stamped = source.replace(BUILD_ID_PLACEHOLDER, buildId);
  if (stamped.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error("Build stopped: __BUILD_ID__ placeholder survived in sw.js.");
  }
  return stamped;
}
