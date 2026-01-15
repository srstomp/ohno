#!/usr/bin/env node
/**
 * ohno-cli entry point
 */

import { createCli } from "./cli.js";

const program = createCli();
program.parse();
