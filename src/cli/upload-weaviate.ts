import { runVectorStoreUpload } from "./vector-store-upload-runner.js";

runVectorStoreUpload("weaviate").catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
