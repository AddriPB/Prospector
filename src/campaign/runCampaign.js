import { collectProspects } from "../sources/index.js";
import { mergeDuplicateProspects } from "../normalize/prospect.js";
import { scoreProspect } from "../score/scoreProspect.js";
import { buildContactMessage } from "../messages/contactMessage.js";
import { openDatabase, saveCampaignRun, getCampaignResults } from "../storage/database.js";
import { exportCampaign } from "../exports/exportCampaign.js";

export async function runCampaign(campaign, runtimeConfig, options = {}) {
  const sourceRecords = options.fixtureRecords
    ? options.fixtureRecords
    : await collectProspects(campaign, runtimeConfig, options);

  const prospects = mergeDuplicateProspects(sourceRecords).map((prospect) => {
    const scoreResult = scoreProspect(prospect, campaign);
    return {
      ...prospect,
      score: scoreResult.score,
      scoreReasons: scoreResult.reasons,
      message: buildContactMessage(prospect, campaign, scoreResult)
    };
  });

  const db = await openDatabase(runtimeConfig.dbPath);
  try {
    saveCampaignRun(db, campaign, prospects);
    const rows = getCampaignResults(db, campaign.id);
    const exportPaths = exportCampaign(campaign, rows, runtimeConfig.exportDir);
    return {
      collected: sourceRecords.length,
      qualified: rows.length,
      exportPaths,
      rows
    };
  } finally {
    db.close();
  }
}
