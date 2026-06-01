import { collectProspects } from "../sources/index.js";
import {
  computeQualificationState,
  mergeDuplicateProspects
} from "../normalize/prospect.js";
import { scoreProspect } from "../score/scoreProspect.js";
import { buildContactMessage } from "../messages/contactMessage.js";
import { openDatabase, saveCampaignRun, getCampaignResults } from "../storage/database.js";
import { exportCampaign } from "../exports/exportCampaign.js";

export async function runCampaign(campaign, runtimeConfig, options = {}) {
  let sourceRecords = options.fixtureRecords || null;
  let collectionErrors = [];

  if (!sourceRecords) {
    const collectionResult = await collectProspects(campaign, runtimeConfig, options);
    sourceRecords = collectionResult.records;
    collectionErrors = collectionResult.errors;
  }

  const prospects = mergeDuplicateProspects(sourceRecords).map((prospect) => {
    const scoreResult = scoreProspect(prospect, campaign);
    return {
      ...prospect,
      score: scoreResult.score,
      scoreBreakdown: scoreResult.scoreBreakdown,
      scoreReasons: scoreResult.reasons,
      qualificationState: computeQualificationState(prospect, { score: scoreResult.score }),
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
      collectionErrors,
      exportPaths,
      rows
    };
  } finally {
    db.close();
  }
}
