import resolve from "rollup-plugin-node-resolve"
import commonjs from "rollup-plugin-commonjs"
import typescript from "rollup-plugin-typescript2"
import { terser } from 'rollup-plugin-terser'

export default {
  input: "./src/sqlite3-storage.ts",
  output: {
    file: "./umd/sqlite3-storage.js",
    format: "umd",
    name: "window",
    extend: true,
    sourcemap: true,
    sourcemapExcludeSources: true,
  },

  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      tsconfigOverride: {
        compilerOptions: {
          module: "es2015",
          sourceMap: true,
          declaration: false,
        },
      },
    }),
    terser(),
  ],
}
