import { runCampaign } from "../campaign/runCampaign.js";

export function startNightlyWorker(campaign, runtimeConfig) {
  let running = false;

  const runOnce = async () => {
    if (running) {
      console.log(`[prospector] Campagne nocturne deja en cours ${campaign.id}`);
      return;
    }

    running = true;
    try {
      console.log(`[prospector] Lancement campagne nocturne ${campaign.id}`);
      const result = await runCampaign(campaign, runtimeConfig);
      const errorSuffix = result.collectionErrors?.length
        ? `, sources ignorees: ${result.collectionErrors
            .map((error) => `${error.source} (${error.message})`)
            .join("; ")}`
        : "";
      console.log(
        `[prospector] Campagne terminee: ${result.qualified} prospects, CSV ${result.exportPaths.csvPath}${errorSuffix}`
      );
    } finally {
      running = false;
    }
  };

  const scheduleNext = () => {
    const delayMs = nextNightlyDelayMs(runtimeConfig);
    const nextAt = new Date(Date.now() + delayMs).toISOString();
    console.log(`[prospector] Prochaine campagne nocturne planifiee: ${nextAt}`);
    setTimeout(async () => {
      try {
        await runOnce();
      } catch (error) {
        console.error(error);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  console.log(
    `[prospector] Worker actif, campagne ${campaign.id}, horaire ${runtimeConfig.nightlyHour}:${String(
      runtimeConfig.nightlyMinute
    ).padStart(2, "0")} ${runtimeConfig.timezone}`
  );
  scheduleNext();
}

export function nextNightlyDelayMs(runtimeConfig, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: runtimeConfig.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const currentLocalAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  let targetLocalAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    runtimeConfig.nightlyHour,
    runtimeConfig.nightlyMinute,
    0
  );

  if (targetLocalAsUtcMs <= currentLocalAsUtcMs) {
    targetLocalAsUtcMs += 24 * 60 * 60 * 1000;
  }

  return targetLocalAsUtcMs - currentLocalAsUtcMs;
}
