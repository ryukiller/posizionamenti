#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadConfig } from "./config";
import { StubScanner } from "./services/scanner";
import { ScanOrchestrator } from "./services/scanOrchestrator";

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .command(
      "run-once",
      "Esegue una singola scansione (lettura target, scansione, invio risultati)",
      (y) =>
        y
          .option("client-id", {
            type: "string",
            describe: "Filtra per clienteId",
          })
          .option("contract-id", {
            type: "string",
            describe: "Filtra per contrattoId",
          })
          .option("max-results-per-batch", {
            type: "number",
            describe: "Numero massimo di risultati per batch",
          })
          .option("dry-run", {
            type: "boolean",
            default: false,
            describe:
              "Esegue tutto il flusso senza inviare dati di scrittura al backend",
          }),
      async (args) => {
        const config = loadConfig();
        const scanner = new StubScanner();
        const orchestrator = new ScanOrchestrator(config, scanner);
        await orchestrator.runOnce({
          clienteId: args["client-id"],
          contrattoId: args["contract-id"],
          maxResultsPerBatch: args["max-results-per-batch"],
          dryRun: args["dry-run"],
        });
      },
    )
    .command(
      "run-loop",
      "Esegue run-once periodicamente",
      (y) =>
        y
          .option("interval-ms", {
            type: "number",
            default: 5 * 60 * 1000,
            describe: "Intervallo tra esecuzioni (ms)",
          })
          .option("client-id", {
            type: "string",
            describe: "Filtra per clienteId",
          })
          .option("contract-id", {
            type: "string",
            describe: "Filtra per contrattoId",
          })
          .option("max-results-per-batch", {
            type: "number",
            describe: "Numero massimo di risultati per batch",
          })
          .option("dry-run", {
            type: "boolean",
            default: false,
            describe:
              "Esegue tutto il flusso senza inviare dati di scrittura al backend",
          }),
      async (args) => {
        const config = loadConfig();
        const scanner = new StubScanner();
        const orchestrator = new ScanOrchestrator(config, scanner);

        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            await orchestrator.runOnce({
              clienteId: args["client-id"],
              contrattoId: args["contract-id"],
              maxResultsPerBatch: args["max-results-per-batch"],
              dryRun: args["dry-run"],
            });
          } catch (error) {
            // error already logged inside orchestrator; stop loop on fatal errors
            break;
          }

          await new Promise((resolve) => {
            setTimeout(resolve, args["interval-ms"]);
          });
        }
      },
    )
    .demandCommand(1)
    .strict()
    .help().argv;

  void argv;
}

// eslint-disable-next-line no-console
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
