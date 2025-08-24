import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Fine-tunes a GPT-4o-mini model with given dataset.
 */
async function trainModel(modelName, datasetPath) {
  try {
    console.log(`\n🚀 Training model for: ${modelName}`);

    // 1. Upload dataset
    const file = await client.files.create({
      purpose: "fine-tune",
      file: fs.createReadStream(datasetPath),
    });
    console.log(`✅ Uploaded dataset: ${datasetPath}, File ID: ${file.id}`);

    // 2. Create fine-tune job
    const fineTune = await client.fineTunes.create({
      training_file: file.id,
      model: "gpt-4o-mini",
    });

    console.log(
      `📌 Fine-tune job created for ${modelName}, Job ID: ${fineTune.id}`
    );
    console.log(`   Use "openai fine_tunes.follow -i ${fineTune.id}" to track.`);
  } catch (error) {
    console.error(`❌ Error training ${modelName}:`, error);
  }
}

async function main() {
  await trainModel(
    "Estimation",
    "./datasets/estimation_training_data.jsonl"
  );
  await trainModel(
    "Decomposition",
    "./datasets/decomposition_training_data.jsonl"
  );
  await trainModel(
    "Testing",
    "./datasets/testing_training_data.jsonl"
  );
}

main();
