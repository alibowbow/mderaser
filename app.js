(function (root) {
  "use strict";

  const SAMPLE_MARKDOWN = `# 오늘의 메모

마크다운은 **빠르게 쓰기 좋지만**, 다른 곳에 붙여넣을 때는 기호가 거슬릴 수 있어요.

> 필요한 건 서식이 아니라 내용입니다.

- [x] 제목과 강조 지우기
- [ ] 링크와 표 정리하기
- 일반 목록은 읽기 쉽게 남기기

[마크다운 안내](https://www.markdownguide.org/)에서 자세히 볼 수 있습니다.

| 항목 | 상태 |
| --- | --- |
| 실시간 변환 | 완료 |
| 서버 전송 | 없음 |

\`\`\`js
const message = "코드 내용은 그대로 남아요.";
\`\`\``;

  const ESCAPE_START = "\uE000";
  const ESCAPE_END = "\uE001";
  const CODE_START = "\uE100";
  const CODE_END = "\uE101";

  function decodeEntities(value) {
    const named = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"'
    };

    return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, function (match, entity) {
      if (entity.charAt(0) === "#") {
        const hexadecimal = entity.charAt(1).toLowerCase() === "x";
        const number = parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        if (!Number.isFinite(number) || number < 0 || number > 0x10ffff) return match;
        try {
          return String.fromCodePoint(number);
        } catch (_error) {
          return match;
        }
      }
      return Object.prototype.hasOwnProperty.call(named, entity.toLowerCase())
        ? named[entity.toLowerCase()]
        : match;
    });
  }

  function isTableDivider(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function cleanTableRow(line) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return line;

    const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    const cells = withoutEdges.split("|").map(function (cell) {
      return cell.trim();
    });

    return cells.join("  ·  ");
  }

  function stripMarkdown(source) {
    if (typeof source !== "string" || source.length === 0) return "";

    const escapedCharacters = [];
    const protectedCode = [];
    let text = source.replace(/\r\n?/g, "\n");

    function protectCode(value) {
      const token = CODE_START + protectedCode.length + CODE_END;
      protectedCode.push(value);
      return token;
    }

    text = text.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, function (_match, character) {
      const token = ESCAPE_START + escapedCharacters.length + ESCAPE_END;
      escapedCharacters.push(character);
      return token;
    });

    // 문서 맨 위의 YAML front matter와 보이지 않는 주석을 제거합니다.
    text = text.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
    text = text.replace(/<!--[\s\S]*?-->/g, "");

    // 링크 참조와 각주 정의는 본문이 아니므로 제거합니다.
    text = text.replace(/^[ \t]{0,3}\[[^\]]+\]:[ \t]+\S+.*$/gm, "");
    text = text.replace(/^[ \t]{0,3}\[\^[^\]]+\]:[ \t]+.*$/gm, "");

    // 코드 펜스와 인라인 코드는 먼저 보호해 내부 기호와 HTML을 보존합니다.
    text = text.replace(/^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*$/gm, function (_match, _fence, code) {
      return protectCode(code);
    });
    text = text.replace(/(`+)([^\n]*?)\1/g, function (_match, _ticks, code) {
      return protectCode(code.replace(/^\s(?=\s*\S)|\s$/g, ""));
    });
    // 닫히지 않은 펜스가 있더라도 펜스 기호 자체는 결과에서 지웁니다.
    text = text.replace(/^[ \t]{0,3}(?:```|~~~)[^\n]*$/gm, "");

    // 이미지에는 대체 텍스트를, 링크에는 화면에 보이는 문구만 남깁니다.
    text = text.replace(/!\[([^\]]*)\]\([^\n)]*\)/g, "$1");
    text = text.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1");
    for (let pass = 0; pass < 8; pass += 1) {
      const next = text
        .replace(/\[([^\[\]]+)\]\([^\n)]*\)/g, "$1")
        .replace(/\[([^\[\]]+)\]\[[^\]]*\]/g, "$1");
      if (next === text) break;
      text = next;
    }
    text = text.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, function (_match, address) {
      return address.replace(/^mailto:/i, "");
    });
    text = text.replace(/<([\w.+-]+@[\w.-]+\.[a-z]{2,})>/gi, "$1");

    // HTML은 렌더링하지 않고 텍스트만 남깁니다.
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/(?:address|article|aside|blockquote|div|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi, "\n");
    text = text.replace(/<[^>]*>/g, "");
    text = decodeEntities(text);

    // 블록 수식은 바깥 펜스만 제거합니다.
    text = text.replace(/^[ \t]*\$\$[ \t]*$/gm, "");

    // 제목, 인용, 목록 기호를 읽기 좋은 일반 텍스트로 바꿉니다.
    text = text.replace(/^(.+)\n[ \t]*(?:=+|-+)[ \t]*$/gm, "$1");
    text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, "$1");
    text = text.replace(/^[ \t]{0,3}(?:>[ \t]*)+/gm, "");
    text = text.replace(/^([ \t]*)[-+*][ \t]+\[([xX ])\][ \t]+/gm, function (_match, indent, state) {
      return indent + (state.toLowerCase() === "x" ? "✓ " : "○ ");
    });
    text = text.replace(/^([ \t]*)[-+*][ \t]+/gm, "$1• ");
    text = text.replace(/^([ \t]*)(\d+)[.)][ \t]+/gm, "$1$2. ");
    text = text.replace(/\[\^[^\]]+\]/g, "");

    // 표 구분선은 없애고 각 셀은 가운데점으로 구분합니다.
    text = text
      .split("\n")
      .filter(function (line) {
        return !isTableDivider(line);
      })
      .map(cleanTableRow)
      .join("\n");

    // 강조·취소선 기호를 여러 겹까지 순서대로 제거합니다.
    for (let pass = 0; pass < 4; pass += 1) {
      text = text
        .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
        .replace(/~~(?=\S)([^\n]*?\S)~~/g, "$1")
        .replace(/(^|[^\w])([*_])(?=\S)([^*_\n]*?\S)\2(?=$|[^\w])/gm, "$1$3");
    }

    // 수평선과 줄 끝 강제 개행 공백을 정리합니다.
    text = text.replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, "");
    text = text.replace(/[ \t]+$/gm, "");
    text = text.replace(/^[ \t]+$/gm, "");
    text = text.replace(/\n{3,}/g, "\n\n");

    text = text.replace(new RegExp(ESCAPE_START + "(\\d+)" + ESCAPE_END, "g"), function (_match, index) {
      return escapedCharacters[Number(index)] || "";
    });
    text = text.replace(new RegExp(CODE_START + "(\\d+)" + CODE_END, "g"), function (_match, index) {
      return protectedCode[Number(index)] || "";
    });

    return text.trim();
  }

  const api = { stripMarkdown: stripMarkdown };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MarkdownEraser = api;

  if (typeof document === "undefined") return;

  const markdownInput = document.getElementById("markdownInput");
  const cleanOutput = document.getElementById("cleanOutput");
  const inputCount = document.getElementById("inputCount");
  const outputCount = document.getElementById("outputCount");
  const sampleButton = document.getElementById("sampleButton");
  const pasteButton = document.getElementById("pasteButton");
  const clearButton = document.getElementById("clearButton");
  const copyButton = document.getElementById("copyButton");
  const toast = document.getElementById("toast");
  let toastTimer;

  function formatCount(value) {
    return value.length.toLocaleString("ko-KR") + "자";
  }

  function updateResult() {
    const source = markdownInput.value;
    const result = stripMarkdown(source);

    cleanOutput.value = result;
    inputCount.textContent = formatCount(source);
    outputCount.textContent = formatCount(result);
    clearButton.disabled = source.length === 0;
    copyButton.disabled = result.length === 0;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 1800);
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    cleanOutput.focus();
    cleanOutput.select();
    const copied = document.execCommand("copy");
    cleanOutput.setSelectionRange(0, 0);
    markdownInput.focus();
    if (!copied) throw new Error("copy failed");
  }

  markdownInput.addEventListener("input", updateResult);

  sampleButton.addEventListener("click", function () {
    markdownInput.value = SAMPLE_MARKDOWN;
    updateResult();
    markdownInput.focus();
    showToast("예시를 불러왔어요.");
  });

  pasteButton.addEventListener("click", async function () {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("clipboard unavailable");
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        markdownInput.focus();
        showToast("클립보드가 비어 있어요.");
        return;
      }
      markdownInput.value = clipboardText;
      updateResult();
      markdownInput.focus();
      showToast("붙여넣었어요.");
    } catch (_error) {
      markdownInput.focus();
      showToast("입력칸을 누르고 Ctrl+V로 붙여넣어 주세요.");
    }
  });

  clearButton.addEventListener("click", function () {
    markdownInput.value = "";
    updateResult();
    markdownInput.focus();
    showToast("모두 지웠어요.");
  });

  copyButton.addEventListener("click", async function () {
    try {
      await copyText(cleanOutput.value);
      showToast("클린 텍스트를 복사했어요.");
    } catch (_error) {
      cleanOutput.focus();
      cleanOutput.select();
      showToast("결과를 선택했어요. Ctrl+C로 복사해 주세요.");
    }
  });

  updateResult();
})(typeof globalThis !== "undefined" ? globalThis : this);
