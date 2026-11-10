// Copied from https://exa.ai/docs/integrations/vercel/ai-sdk ("Quick start" and
// "Configure search"). The model is replaced by the AI SDK test model so this
// file type-checks without a provider package.
import { generateText, stepCountIs } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { webSearch, type ExaSearchConfig } from "@exalabs/ai-sdk";

const model = new MockLanguageModelV3();

export async function quickstart() {
  const { text } = await generateText({
    model,
    prompt: "Tell me the latest developments in AI",
    system: "Only use web search once per turn. Answer based on the information you have.",
    tools: {
      webSearch: webSearch(),
    },
    stopWhen: stepCountIs(3),
  });
  return text;
}

export async function configure() {
  const { text } = await generateText({
    model,
    prompt: "Find the top AI companies in Europe founded after 2018",
    tools: {
      webSearch: webSearch({
        type: "auto",
        numResults: 6,
        category: "company",
        contents: {
          text: { maxCharacters: 1000 },
          maxAgeHours: 1,
          summary: true,
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });
  return text;
}

const config: ExaSearchConfig = {
  numResults: 10,
  type: "auto",
};
export const search = webSearch(config);
