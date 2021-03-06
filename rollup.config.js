import typescript from "rollup-plugin-typescript2"

export default {
  input: "./src/sqlite3-storage.ts",
  output: {
    file: "./lib/sqlite3-storage.js",
    format: "cjs",
    sourcemap: true,
    sourcemapExcludeSources: true,
  },
  external: ["better-sqlite3"],

  plugins: [
    typescript({
      tsconfig: "./src/tsconfig.json",
      tsconfigOverride: {
        compilerOptions: {
          module: "es2015",
          sourceMap: true,
          declaration: false,
        },
      },
    }),
  ],
}
