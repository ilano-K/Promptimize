import envPaths from "env-paths";
import path from "node:path";

// On Windows env-paths splits each app in two subfolders ("Config" under
// roaming %APPDATA%, "Data" under local %LOCALAPPDATA%). One folder per app is
// the Windows convention, so take the parent there. macOS and Linux already
// give app-named folders, and their parent is shared by every app.
const paths = envPaths("promptimize", { suffix: "" });
const windows = process.platform === "win32";

export const configDir = windows ? path.dirname(paths.config) : paths.config;
export const dataDir = windows ? path.dirname(paths.data) : paths.data;
