import dotenv from "dotenv";
import path from "path";

// Load .env explicitly for vitest test runs
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import "@testing-library/jest-dom/vitest";
