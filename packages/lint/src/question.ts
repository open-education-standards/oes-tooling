import type { ResolvedQuestion } from "@inklyre/oes-core";
import type { LintIssue } from "./types.js";
import { checkIdExists, checkPermutation } from "./rules/answer-references.js";
import { checkAnswerKeyFile } from "./rules/answer-key-file.js";
import { checkUniqueIds } from "./rules/unique-ids.js";

/**
 * Run every question-level rule: duplicate ids within the question's own
 * option/item/etc. arrays, dangling answer cross-references (only
 * meaningful in self-practice mode — a secured `answer_key` means the
 * answer isn't inline to check), and `answer_key.file` existence.
 */
export async function lintQuestion(resolved: ResolvedQuestion, at: string, issues: LintIssue[]): Promise<void> {
  const { question } = resolved;
  const typeConfigAt = `${at}.type_config`;
  const isSecured = question.answer_key !== undefined;

  switch (question.type) {
    case "mcq": {
      const { options, answer } = question.type_config;
      checkUniqueIds(options, `${typeConfigAt}.options`, issues);
      if (!isSecured && answer !== undefined) {
        checkIdExists(answer, options, `${typeConfigAt}.answer`, issues);
      }
      break;
    }
    case "msq": {
      const { options, answers } = question.type_config;
      checkUniqueIds(options, `${typeConfigAt}.options`, issues);
      if (!isSecured) {
        (answers ?? []).forEach((answer, i) => checkIdExists(answer, options, `${typeConfigAt}.answers[${i}]`, issues));
      }
      break;
    }
    case "match": {
      const { left, right, pairs } = question.type_config;
      checkUniqueIds(left, `${typeConfigAt}.left`, issues);
      checkUniqueIds(right, `${typeConfigAt}.right`, issues);
      if (!isSecured) {
        (pairs ?? []).forEach((pair, i) => {
          checkIdExists(pair.left_id, left, `${typeConfigAt}.pairs[${i}].left_id`, issues);
          checkIdExists(pair.right_id, right, `${typeConfigAt}.pairs[${i}].right_id`, issues);
        });
      }
      break;
    }
    case "order": {
      const { items, correct_order } = question.type_config;
      checkUniqueIds(items, `${typeConfigAt}.items`, issues);
      if (!isSecured && correct_order !== undefined) {
        checkPermutation(correct_order, items, `${typeConfigAt}.correct_order`, issues);
      }
      break;
    }
    case "fill_blank":
      checkUniqueIds(question.type_config.blanks, `${typeConfigAt}.blanks`, issues);
      break;
    case "code":
      checkUniqueIds(question.type_config.test_cases, `${typeConfigAt}.test_cases`, issues);
      break;
    case "diagram":
      checkUniqueIds(question.type_config.labels, `${typeConfigAt}.labels`, issues);
      break;
    case "numerical":
    case "short_answer":
    case "essay":
    case "submission":
      break;
  }

  await checkAnswerKeyFile(resolved, at, issues);
}
