#!/usr/bin/env node
/**
 * ohno-cli entry point
 */

import "./node-guard.js";
import { createCli } from "./cli.js";

const program = createCli();
program.parse();
