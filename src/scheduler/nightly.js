import { runCampaign } from "../campaign/runCampaign.js";

export function startNightlyWorker(campaign, runtimeConfig) {
  const runOnce = async () => {
    const now = new Date();
    const hour = Number(
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: runtimeConfig.timezone,
        hour: "2-digit",
        hour12: false
      }).format(now)
    );
    const minute = Number(
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: runtimeConfig.timezone,
        minute: "2-digit"
      }).format(now)
    );

    if (hour === runtimeConfig.nightlyHour && minute === runtimeConfig.nightlyMinute) {
      console.log(`[prospector] Lancement campagne nocturne ${campaign.id}`);
      const result = await runCampaign(campaign, runtimeConfig);
      console.log(
        `[prospector] Campagne terminee: ${result.qualified} prospects, CSV ${result.exportPaths.csvPath}`
      );
    }
  };

  console.log(
    `[prospector] Worker actif, campagne ${campaign.id}, horaire ${runtimeConfig.nightlyHour}:${String(
      runtimeConfig.nightlyMinute
    ).padStart(2, "0")} ${runtimeConfig.timezone}`
  );
  setInterval(() => runOnce().catch((error) => console.error(error)), 60_000);
}
