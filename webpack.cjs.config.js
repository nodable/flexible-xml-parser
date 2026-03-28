"use strict";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the file URL of the current module
const __filename = fileURLToPath(import.meta.url);

// Derive the directory name
const __dirname = dirname(__filename);

export default [
    {
        entry: "./src/fxp.js",
        mode: "production",
        output: {
            path: __dirname,
            filename: "./lib/fxp.cjs",
            // library: "fxp",
            libraryTarget: "commonjs2"
        },
        target: "node"
    }, {
        context: __dirname,
        entry: "./src/fxp.js",
        mode: "production",
        devtool: "source-map",
        output: {
            path: __dirname,
            filename: "./lib/fxp.min.js",
            library: "fxp",
            libraryTarget: "umd",
            globalObject: "this"
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    loader: "babel-loader"
                }
            ]
        },
        target: "web"
    }
];
