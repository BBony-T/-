/******************************************************
 * 오늘의 해냄 - NFC 연동 미션 인증 웹앱
 * - 당일(localStorage)만 기록
 * - Google Sheets + 커스텀 문구
 * - 명언 콤마 & 저자 표시
 * - 인증 사진 저장 & 목록 표시
 * - 관리자 비번 기반 삭제 기능
 ******************************************************/

/* ==============================
   1. DOM 요소 & 상태
   ============================== */
const views = {
  main: document.getElementById("view-main"),
  certify: document.getElementById("view-certify"),
  list: document.getElementById("view-list"),
};

const btnGoCertify = document.getElementById("btn-go-certify");
const btnGoList = document.getElementById("btn-go-list");
const btnBackFromCertify = document.getElementById("btn-back-from-certify");
const btnBackFromList = document.getElementById("btn-back-from-list");

const randomCategoryLabel = document.getElementById("random-category-label");
const randomMessageText = document.getElementById("random-message-text");
const randomMessageAuthor = document.getElementById("random-message-author");

const certifyForm = document.getElementById("certify-form");
const nicknameInput = document.getElementById("nickname");
const messageInput = document.getElementById("message");

const recordsContainer = document.getElementById("records-container");
const topUserInfo = document.getElementById("top-user-info");
const btnToggleAdmin = document.getElementById("btn-toggle-admin");
const rankingsContainer = document.getElementById("rankings-container"); // 🆕 추가

// 카메라 관련 요소
const video = document.getElementById("camera-preview");
const canvas = document.getElementById("captured-canvas");
const cameraOverlayText = document.getElementById("camera-overlay-text");
const btnTakePhoto = document.getElementById("btn-take-photo");
const btnRetakePhoto = document.getElementById("btn-retake-photo");
const cameraErrorText = document.getElementById("camera-error");

// 🎉 인증 성공 토스트
const successToast = document.getElementById("success-toast");

// 현재 활성화된 미디어 스트림
let currentStream = null;

// 마지막으로 촬영한 이미지 dataURL (이번 인증에 사용)
let lastCapturedImageDataUrl = null;

// 관리자 모드 여부 & 비밀번호
let isAdminMode = false;
// 👉 여기서 비밀번호 바꾸면 됨
const ADMIN_PASSWORD = "haenem1234";

/* ==============================
   2. 날짜/시간 유틸
   ============================== */

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNowDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/* ==============================
   3. localStorage 인증 데이터 관리
   ============================== */

const STORAGE_KEY = "haenemRecords";

/**
 * records 요소 예시:
 * {
 *   nickname: "뽀니쌤",
 *   message: "#성공",
 *   timestamp: "2025-12-04 15:00:00",
 *   imageData: "data:image/jpeg;base64,..."  // 없으면 null
 * }
 */
function loadTodayData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      date: getTodayString(),
      records: [],
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const today = getTodayString();

    if (parsed.date !== today) {
      return {
        date: today,
        records: [],
      };
    }

    if (!Array.isArray(parsed.records)) {
      parsed.records = [];
    }

    // 예전 데이터에 imageData가 없을 수 있으므로 안전하게 정리
    parsed.records = parsed.records.map((rec) => ({
      nickname: rec.nickname || "",
      message: rec.message || "",
      timestamp: rec.timestamp || "",
      imageData: rec.imageData || null,
    }));

    return parsed;
  } catch (e) {
    console.error("Failed to parse localStorage data:", e);
    return {
      date: getTodayString(),
      records: [],
    };
  }
}

function saveTodayData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function initializeStorageForToday() {
  const data = loadTodayData();
  saveTodayData(data);
}

/**
 * 새 인증 기록 추가
 */
function addRecord(nickname, message, imageData) {
  const data = loadTodayData();
  const timestamp = getNowDateTimeString();

  const newRecord = {
    nickname,
    message,
    timestamp,
    imageData: imageData || null,
  };

  // 최신이 위로 오도록
  data.records.unshift(newRecord);
  saveTodayData(data);
}

/**
 * 특정 인덱스의 기록 삭제
 */
function deleteRecordByIndex(index) {
  const data = loadTodayData();

  if (index < 0 || index >= data.records.length) return;

  data.records.splice(index, 1);
  saveTodayData(data);
}

/* ==============================
   4. 인증자 목록 렌더링
   ============================== */

function renderRecords() {
  const data = loadTodayData();
  const records = data.records;

  // 닉네임별 인증 횟수 집계
  const counts = {};
  records.forEach((rec) => {
    const name = rec.nickname || "이름없음";
    counts[name] = (counts[name] || 0) + 1;
  });

  // 최다 인증자(1위)
  let topNickname = null;
  let topCount = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topNickname = name;
    }
  }

  // 최다 인증자 텍스트
  if (!records.length) {
    topUserInfo.innerHTML = "아직 오늘의 최다 인증자가 없습니다.";
  } else if (topNickname) {
    topUserInfo.innerHTML = `
      <span class="crown-icon">👑</span>
      오늘의 최다 인증자: <strong>${topNickname}</strong> (${topCount}회)
    `;
  }

  // 🆕 TOP 5 순위 박스 만들기
  rankingsContainer.innerHTML = "";
  if (records.length) {
    // counts 객체 → 배열로 변환 후 정렬
    const rankingArray = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count) // 많이한 순
      .slice(0, 5); // 최대 5명

    if (rankingArray.length) {
      const box = document.createElement("div");
      box.className = "ranking-box";

      const title = document.createElement("div");
      title.className = "ranking-title";
      title.textContent = "오늘의 인증 순위 TOP 5";
      box.appendChild(title);

      const list = document.createElement("div");
      list.className = "ranking-list";

      rankingArray.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "ranking-item";
        row.textContent = `${idx + 1}위 ${item.name} (${item.count}회)`;
        list.appendChild(row);
      });

      box.appendChild(list);
      rankingsContainer.appendChild(box);
    }
  }

  // 아래는 기존 카드 렌더링 부분
  recordsContainer.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "no-records";
    empty.textContent = "아직 오늘의 인증 기록이 없습니다.";
    recordsContainer.appendChild(empty);
    return;
  }

  records.forEach((record, index) => {
    const item = document.createElement("div");
    item.className = "record-item";

    const header = document.createElement("div");
    header.className = "record-header";

    const leftBox = document.createElement("div");
    leftBox.className = "record-left";

    const nicknameSpan = document.createElement("span");
    nicknameSpan.className = "record-nickname";
    nicknameSpan.textContent = record.nickname;

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "record-badge";
    const nicknameCount = counts[record.nickname] || 1;
    badgeSpan.textContent = `${nicknameCount}회`;

    leftBox.appendChild(nicknameSpan);
    leftBox.appendChild(badgeSpan);

    const rightBox = document.createElement("div");
    rightBox.style.display = "flex";
    rightBox.style.alignItems = "center";
    rightBox.style.gap = "4px";

    const timeSpan = document.createElement("span");
    timeSpan.className = "record-timestamp";
    timeSpan.textContent = record.timestamp;
    rightBox.appendChild(timeSpan);

    // 관리자 모드일 때만 삭제 버튼 표시
    if (isAdminMode) {
      const delBtn = document.createElement("button");
      delBtn.className = "record-delete-btn";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => {
        const ok = confirm("정말 이 인증 기록을 삭제할까요?");
        if (!ok) return;
        deleteRecordByIndex(index);
        renderRecords();
      });
      rightBox.appendChild(delBtn);
    }

    header.appendChild(leftBox);
    header.appendChild(rightBox);

    const messageP = document.createElement("p");
    messageP.className = "record-message";
    messageP.textContent = record.message;

    item.appendChild(header);
    item.appendChild(messageP);

    // 사진이 있는 경우 썸네일 추가
    if (record.imageData) {
      const img = document.createElement("img");
      img.className = "record-photo";
      img.src = record.imageData;
      img.alt = "인증 사진";
      item.appendChild(img);
    }

    recordsContainer.appendChild(item);
  });
}

/* ==============================
   5. 화면 전환
   ============================== */

function showView(viewName) {
  Object.values(views).forEach((v) => v.classList.remove("active-view"));
  views[viewName].classList.add("active-view");

  if (viewName === "certify") {
    startCamera();
  } else {
    stopCamera();
  }

  if (viewName === "main") {
    showRandomMessage();
  }

  if (viewName === "list") {
    renderRecords();
  }
}

/* ==============================
   6. 카메라 제어 & 사진 촬영
   ============================== */

async function startCamera() {
  cameraErrorText.textContent = "";

  try {
    if (currentStream) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
      },
      audio: false,
    });

    currentStream = stream;
    video.srcObject = stream;
    video.style.display = "block";
    canvas.style.display = "none";
    cameraOverlayText.textContent = "화면을 확인한 뒤, 사진 찍기를 눌러주세요.";
  } catch (error) {
    console.error("Camera error:", error);
    cameraErrorText.textContent =
      "카메라에 접근할 수 없습니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.";
    cameraOverlayText.textContent = "카메라 사용 불가";
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
  video.srcObject = null;
}

/**
 * 사진 촬영 → 캔버스에 그림 → dataURL 저장
 */
function capturePhoto() {
  if (!currentStream) {
    cameraErrorText.textContent =
      "카메라가 활성화되어 있지 않습니다. 권한을 확인해 주세요.";
    return;
  }

  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    cameraErrorText.textContent =
      "영상이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.";
    return;
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, width, height);

  // dataURL로 변환하여 저장 (JPEG, 용량 줄이기)
  try {
    lastCapturedImageDataUrl = canvas.toDataURL("image/jpeg", 0.8);
  } catch (e) {
    console.error("toDataURL error:", e);
    lastCapturedImageDataUrl = null;
  }

  video.style.display = "none";
  canvas.style.display = "block";
  cameraOverlayText.textContent = "사진이 저장되었습니다. 다시 찍을 수도 있어요.";
}

/**
 * 다시 촬영
 */
function retakePhoto() {
  if (!currentStream) {
    startCamera();
    return;
  }
  video.style.display = "block";
  canvas.style.display = "none";
  cameraOverlayText.textContent = "화면을 확인한 뒤, 사진 찍기를 눌러주세요.";
  // 다시 찍을 것이므로 이전 이미지 dataURL은 유지/초기화 선택 가능
  // 여기서는 이전 인증에 사용되지 않았으니 유지해도 무방
}

/* ==============================
   7. Google Sheets + 커스텀 문구
   ============================== */

/**
 * 커스텀 문구 (Sheets 안 쓸 때/오류일 때 사용)
 */
const CUSTOM_MESSAGES = {
  missions: [
    "오늘은 엘리베이터 대신 계단 한 번 이용하기 🚶‍♀️",
    "물 한 컵 더 마시기 💧",
    "눈 감고 30초 동안 깊게 숨 쉬기 🌿",
  ],
  cheers: [
    "지금 이 순간도 충분히 잘하고 있어요 💛",
    "천천히 가도 괜찮아요, 멈추지만 않으면 돼요 🌈",
    "오늘도 해낸 나, 너무 멋져요 ✨",
  ],
  quotes: [
    {
      text: "작은 습관이 큰 변화를 만든다.",
      author: "제임스 클리어",
    },
    {
      text: "완벽보다 ‘시작’이 더 중요하다.",
      author: "작자 미상",
    },
    {
      text: "한 걸음씩, 매일 조금씩 나아가기.",
      author: "",
    },
  ],
};

/**
 * 실제 랜덤 사용 구조
 * missions / cheers: string[]
 * quotes: { text, author }[]
 */
const randomMessages = {
  missions: [],
  cheers: [],
  quotes: [],
};

function useCustomMessagesOnly() {
  randomMessages.missions = [...CUSTOM_MESSAGES.missions];
  randomMessages.cheers = [...CUSTOM_MESSAGES.cheers];
  randomMessages.quotes = CUSTOM_MESSAGES.quotes.map((q) => ({
    text: q.text,
    author: q.author || "",
  }));
}

function mapTypeToCategoryKey(type) {
  const t = (type || "").trim().toLowerCase();

  if (t === "미션" || t === "mission") return "missions";
  if (t === "응원" || t === "cheer" || t === "support") return "cheers";
  if (t === "명언" || t === "quote") return "quotes";

  return null;
}

/**
 * 🔗 Google Sheets CSV URL
 * A1: 미션, B1: 응원, C1: 명언, D1: 명언작성자
 * 2행부터는 각 열에 문구/저자
 */
const SHEETS_CSV_URL = ""; // 필요할 때 CSV URL 붙여넣기

/**
 * 콤마/따옴표 고려한 CSV 파서
 */
function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell);
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else if (char === "\r") {
        // 무시
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

async function loadRandomMessagesFromSheet() {
  // URL이 없으면: 커스텀 문구만 사용
  if (!SHEETS_CSV_URL || SHEETS_CSV_URL.trim() === "https://docs.google.com/spreadsheets/d/e/2PACX-1vSh1gCwxn3vy9Nv0OqjUlrKr68Ix6efjPRqvFq4a64KrOhmJrtomxpNun4TTLzdD3Fz_S-ikFqfotDx/pub?gid=0&single=true&output=csv") {
    useCustomMessagesOnly();

    const totalCount =
      randomMessages.missions.length +
      randomMessages.cheers.length +
      randomMessages.quotes.length;

    if (!totalCount) {
      randomCategoryLabel.textContent = "문구 없음";
      randomMessageText.textContent =
        "CUSTOM_MESSAGES에 문구를 추가해 주세요.";
    } else {
      showRandomMessage();
    }
    return;
  }

  try {
    const res = await fetch(SHEETS_CSV_URL + "?t=" + Date.now());
    const text = await res.text();

    let rows = parseCsv(text);

    rows = rows.filter((row) =>
      row.some((cell) => (cell || "").trim().length > 0)
    );

    if (!rows.length) {
      throw new Error("시트 내용이 비어 있습니다.");
    }

    randomMessages.missions = [];
    randomMessages.cheers = [];
    randomMessages.quotes = [];

    const headerCells = rows[0].map((c) => (c || "").trim());

    let missionCol = -1;
    let cheerCol = -1;
    let quoteCol = -1;
    let quoteAuthorCol = -1;

    headerCells.forEach((header, index) => {
      const key = mapTypeToCategoryKey(header);
      if (key === "missions") missionCol = index;
      else if (key === "cheers") cheerCol = index;
      else if (key === "quotes") quoteCol = index;

      const normalized = header.replace(/\s/g, "").toLowerCase();
      if (
        normalized === "명언작성자" ||
        normalized === "명언_작성자" ||
        normalized === "quoteauthor"
      ) {
        quoteAuthorCol = index;
      }
    });

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];

      if (missionCol >= 0) {
        const v = (cells[missionCol] || "").trim();
        if (v) randomMessages.missions.push(v);
      }

      if (cheerCol >= 0) {
        const v = (cells[cheerCol] || "").trim();
        if (v) randomMessages.cheers.push(v);
      }

      if (quoteCol >= 0) {
        const textVal = (cells[quoteCol] || "").trim();
        if (textVal) {
          let authorVal = "";
          if (quoteAuthorCol >= 0) {
            authorVal = (cells[quoteAuthorCol] || "").trim();
          }
          randomMessages.quotes.push({
            text: textVal,
            author: authorVal,
          });
        }
      }
    }

    const totalCount =
      randomMessages.missions.length +
      randomMessages.cheers.length +
      randomMessages.quotes.length;

    if (!totalCount) {
      useCustomMessagesOnly();
    }

    showRandomMessage();
  } catch (error) {
    console.error("Failed to load CSV:", error);

    useCustomMessagesOnly();

    const totalCount =
      randomMessages.missions.length +
      randomMessages.cheers.length +
      randomMessages.quotes.length;

    if (!totalCount) {
      randomCategoryLabel.textContent = "불러오기 오류";
      randomMessageText.textContent =
        "랜덤 문구를 불러오는 중 오류가 발생했습니다. URL 및 공개 설정을 확인하거나 CUSTOM_MESSAGES를 사용해 주세요.";
    } else {
      showRandomMessage();
    }
  }
}

/**
 * 랜덤 문구 출력 + 테마 + 명언 저자 줄
 */
function showRandomMessage() {
  const availableCategories = [];

  if (randomMessages.missions.length) {
    availableCategories.push("missions");
  }
  if (randomMessages.cheers.length) {
    availableCategories.push("cheers");
  }
  if (randomMessages.quotes.length) {
    availableCategories.push("quotes");
  }

  if (!availableCategories.length) {
    return;
  }

  const randomCategory =
    availableCategories[
      Math.floor(Math.random() * availableCategories.length)
    ];

  randomMessageAuthor.textContent = "";

  if (randomCategory === "missions") {
    randomCategoryLabel.textContent = "[건강 미션]";
    const list = randomMessages.missions;
    const text = list[Math.floor(Math.random() * list.length)];
    randomMessageText.textContent = text;
  } else if (randomCategory === "cheers") {
    randomCategoryLabel.textContent = "[응원 문구]";
    const list = randomMessages.cheers;
    const text = list[Math.floor(Math.random() * list.length)];
    randomMessageText.textContent = text;
  } else if (randomCategory === "quotes") {
    randomCategoryLabel.textContent = "[명언]";
    const list = randomMessages.quotes;
    const q = list[Math.floor(Math.random() * list.length)];
    randomMessageText.textContent = q.text;
    if (q.author) {
      randomMessageAuthor.textContent = `- ${q.author} -`;
    }
  }

  applyThemeByCategory(randomCategory);
}

function applyThemeByCategory(categoryKey) {
  const body = document.body;
  body.classList.remove("theme-mission", "theme-cheer", "theme-quote");

  if (categoryKey === "missions") {
    body.classList.add("theme-mission");
  } else if (categoryKey === "cheers") {
    body.classList.add("theme-cheer");
  } else if (categoryKey === "quotes") {
    body.classList.add("theme-quote");
  }
}

/* ==============================
   8. 인증 성공 토스트
   ============================== */

function showSuccessToast() {
  if (!successToast) return;
  successToast.classList.remove("show");
  void successToast.offsetWidth;
  successToast.classList.add("show");
}

/* ==============================
   9. 관리자 모드 토글
   ============================== */

function toggleAdminMode() {
  if (!isAdminMode) {
    const pwd = prompt("관리자 비밀번호를 입력하세요.");
    if (pwd !== ADMIN_PASSWORD) {
      alert("비밀번호가 올바르지 않습니다.");
      return;
    }
    isAdminMode = true;
    btnToggleAdmin.textContent = "관리자 모드 종료";
    renderRecords();
  } else {
    isAdminMode = false;
    btnToggleAdmin.textContent = "선택 삭제 (관리자용)";
    renderRecords();
  }
}

/* ==============================
   10. 이벤트 바인딩
   ============================== */

btnGoCertify.addEventListener("click", () => showView("certify"));
btnGoList.addEventListener("click", () => showView("list"));
btnBackFromCertify.addEventListener("click", () => showView("main"));
btnBackFromList.addEventListener("click", () => showView("main"));

btnTakePhoto.addEventListener("click", capturePhoto);
btnRetakePhoto.addEventListener("click", retakePhoto);

btnToggleAdmin.addEventListener("click", toggleAdminMode);

certifyForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const nickname = nicknameInput.value.trim();
  const message = messageInput.value.trim();

  if (!nickname || !message) {
    alert("닉네임과 인증 문구를 모두 입력해 주세요.");
    return;
  }

  addRecord(nickname, message, lastCapturedImageDataUrl);

  nicknameInput.value = "";
  messageInput.value = "";
  lastCapturedImageDataUrl = null; // 다음 인증은 새로 찍게

  showSuccessToast();
  showView("list");
});

/* ==============================
   11. 초기 실행
   ============================== */

function init() {
  initializeStorageForToday();
  loadRandomMessagesFromSheet();
  showView("main");
}

document.addEventListener("DOMContentLoaded", init);
