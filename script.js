/******************************************************
 * 오늘의 해냄 - Firebase 공유 버전
 * - 사진: Firebase Storage
 * - 기록: Firestore (certifications 컬렉션)
 * - Auth: 익명 로그인 기본, 관리자 모드에서 이메일/비번 로그인
 ******************************************************/

// 🔥 Firebase SDK 불러오기 (ES Modules CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  deleteDoc,
  serverTimestamp,
  updateDoc,          // 🔹 추가
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  uploadString,       // 🔹 추가 (addCertificationToFirebase에서 사용)
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

/* ==============================
   0. Firebase 초기화
   ============================== */

// 👉 여기 네 프로젝트 설정 값 붙여넣기
const firebaseConfig = {
  apiKey: "AIzaSyB9zgqcdXbxyMJImA6-W4mAsELZBKcvxMY",
  authDomain: "haenem-today.firebaseapp.com",
  projectId: "haenem-today",
  storageBucket: "haenem-today.firebasestorage.app",
  messagingSenderId: "1083124537520",
  appId: "1:1083124537520:web:6263fc32ff6b5b2a150375",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/* 익명 로그인 기본 */
async function ensureAnonymousLogin() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("로그인 상태:", user.uid, user.isAnonymous ? "(익명)" : "(관리자 또는 일반계정)");
  } else {
    console.log("로그아웃 상태");
  }
});

/* 관리자 모드 여부 (UI용) 삭제 let isAdminMode 어쩌구 저쩌구*

/* ==============================
   1. DOM 요소 & 공통 함수
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


const nicknameInput = document.getElementById("nickname");
const messageInput = document.getElementById("certifyMessage");

const recordsContainer = document.getElementById("records-container");
const topUserInfo = document.getElementById("top-user-info");
const btnDeleteSelected = document.getElementById("btn-delete-selected");
const btnDeleteAllRecords = document.getElementById("btn-delete-all-records");
const rankingsContainer = document.getElementById("rankings-container");

// 관리자 선택 삭제 모드 여부
let isAdminSelectionMode = false;

// 관리자 이메일 (Firebase Authentication에 만들어둔 계정)
const ADMIN_EMAIL = "hyeon.k30@gmail.com"; // → 실제 관리자 이메일로 수정

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
// 이번 인증에 사용될 마지막 사진 dataURL
let lastCapturedImageDataUrl = null;

// 오늘 날짜/시간 구하기
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
   2. Firebase 인증 기록 관리
   ============================== */
// 🔹 인증 하나를 Firestore + Storage에 저장
async function addCertificationToFirebase(
  nickname,
  message,
  missionType,
  imageDataUrl
) {
  // 1) 최소한 익명 로그인 보장
  await ensureAnonymousLogin();

  const today = getTodayString();

  // 2) Firestore에 기본 정보 먼저 저장
  const baseDoc = {
    nickname,
    message,
    missionType: missionType || null,
    date: today,
    timestamp: serverTimestamp(), // 서버 기준 시간
  };

  const colRef = collection(db, "certifications");
  const docRef = await addDoc(colRef, baseDoc);
  console.log("📝 Firestore 문서 생성:", docRef.id);

  // 3) 사진이 있는 경우 Storage 업로드 + URL 업데이트
  if (imageDataUrl) {
    try {
      console.log("📤 이미지 업로드 시작 (uploadString)");

      const imagePath = `certifications/${today}/${docRef.id}.jpg`;
      const storageRef = ref(storage, imagePath);

      // ✅ data URL 그대로 업로드
      await uploadString(storageRef, imageDataUrl, "data_url");
      const imageUrl = await getDownloadURL(storageRef);

      await updateDoc(docRef, {
        imagePath,
        imageUrl,
      });

      console.log("✅ imagePath/imageUrl Firestore에 저장 완료");
    } catch (e) {
      console.error("❌ 이미지 업로드/저장 중 오류:", e);
      alert("텍스트 인증은 저장되었지만, 사진 업로드 중 오류가 발생했습니다.");
    }
  } else {
    console.log("⚠ imageDataUrl 없음 – 사진 없이 인증 저장");
  }

  return docRef.id;
}

    // 3) 사진이 있는 경우 Storage 업로드 + URL 업데이트
    /*
    if (imageDataUrl) {
        const imagePath = `certifications/${today}/${docRef.id}.jpg`;
        const storageRef = ref(storage, imagePath);

        // data URL 그대로 업로드
        await uploadString(storageRef, imageDataUrl, "data_url");
        const imageUrl = await getDownloadURL(storageRef);

        await updateDoc(docRef, {
        imagePath,
         imageUrl,
     });
     }
     */// 밑에 return docRef.id 있음. 그다음 함수 끝

//위쪽까지가 새로 추가한 것 B-1의 핵심
// Firestore에서 오늘 기록 가져오기//기존 것 삭제fetchTodayRecords 함수
// 🔹 오늘 날짜의 인증 기록들만 Firestore에서 가져오기(새로 추가 B-2)
async function fetchTodayCertifications() {
  const today = getTodayString();

  const qRef = query(
    collection(db, "certifications"),
    where("date", "==", today),
    orderBy("timestamp", "desc")
  );

  const snap = await getDocs(qRef);
  const records = [];
  snap.forEach((docSnap) => {
    records.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });
  return records;
}


// 인증 기록 추가: 사진 업로드 → Firestore 문서 생성addRecordToFirebase함수삭제


// 특정 기록 삭제 (문서 + 사진)deleteRecordById
async function deleteRecordById(docId, imagePath) {
  // 1) Firestore에서 문서 삭제
  await deleteDoc(doc(db, "certifications", docId));

  // 2) 사진 경로가 있으면 Storage에서도 삭제
  if (imagePath) {
    try {
      const imageRef = ref(storage, imagePath);
      await deleteObject(imageRef);
    } catch (e) {
      console.warn("이미지 삭제 중 오류(이미 없을 수도 있음):", e);
    }
  }
}

// 현재 로그인한 유저가 관리자 이메일인지 체크
function isCurrentUserAdmin() {
  return (
    auth.currentUser &&
    auth.currentUser.email &&
    auth.currentUser.email === ADMIN_EMAIL
  );
}

// 삭제 버튼을 눌렀을 때, 한 번 관리자 인증을 거치는 함수
async function ensureAdminOnce() {
  // 이미 관리자라면 바로 통과
  if (isCurrentUserAdmin()) {
    return;
  }

  const email = prompt("관리자 이메일을 입력하세요:", ADMIN_EMAIL);
  if (!email) throw new Error("관리자 이메일 미입력");

  const password = prompt("관리자 비밀번호를 입력하세요:");
  if (!password) throw new Error("관리자 비밀번호 미입력");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // 로그인이 성공하면 이후 Firestore/Storage delete 권한이 열림
  } catch (e) {
    console.error("관리자 로그인 실패:", e);
    alert("관리자 로그인에 실패했습니다. 이메일/비밀번호를 확인해 주세요.");
    throw e;
  }
}


//오래된 기록 삭제(이전버전) 함수가 있던 부위

/* ==============================
   3. 인증자 목록 렌더링 (Firebase 데이터 사용)
   ============================== */

async function renderRecords() {
  const records = await fetchTodayCertifications();

  // 닉네임별 인증 횟수 계산
  const counts = {};
  records.forEach((rec) => {
    const name = rec.nickname || "이름없음";
    counts[name] = (counts[name] || 0) + 1;
  });

  // 최다 인증자
  let topNickname = null;
  let topCount = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topNickname = name;
    }
  }

  // 최다 인증자 표시
  if (!records.length) {
    topUserInfo.innerHTML = "아직 오늘의 최다 인증자가 없습니다.";
  } else if (topNickname) {
    topUserInfo.innerHTML = `
      <span class="crown-icon">👑</span>
      오늘의 최다 인증자: <strong>${topNickname}</strong> (${topCount}회)
    `;
  }

  // TOP5 순위 박스
  rankingsContainer.innerHTML = "";
  if (records.length) {
    const rankingArray = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

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

  // 카드 목록 렌더링
  recordsContainer.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "no-records";
    empty.textContent = "아직 오늘의 인증 기록이 없습니다.";
    recordsContainer.appendChild(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement("div");
    item.className = "record-item";

    const header = document.createElement("div");
    header.className = "record-header";

    const leftBox = document.createElement("div");
    leftBox.className = "record-left";

    // ✅ 선택 삭제를 위한 체크박스 (관리자 선택 모드일 때만 CSS로 표시)
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "record-select";
    checkbox.dataset.docId = record.id;
    checkbox.dataset.imagePath = record.imagePath || "";

    const nicknameSpan = document.createElement("span");
    nicknameSpan.className = "record-nickname";
    nicknameSpan.textContent = record.nickname || "이름없음";

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "record-badge";
    const nicknameKey = record.nickname || "이름없음";
    const nicknameCount = counts[nicknameKey] || 1;
    badgeSpan.textContent = `${nicknameCount}회`;

    // 체크박스 → 닉네임 → 뱃지 순서로 왼쪽에 넣기
    leftBox.appendChild(checkbox);
    leftBox.appendChild(nicknameSpan);
    leftBox.appendChild(badgeSpan);

    const rightBox = document.createElement("div");
    rightBox.style.display = "flex";
    rightBox.style.alignItems = "center";
    rightBox.style.gap = "4px";

    const timeSpan = document.createElement("span");
    timeSpan.className = "record-timestamp";

    // 🔹 Firestore Timestamp → "HH:MM" 문자열로 변환
    if (record.timestamp && record.timestamp.toDate) {
      const dt = record.timestamp.toDate();
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      timeSpan.textContent = `${hh}:${mm}`;
    } else if (typeof record.timestamp === "string") {
      // 혹시 문자열로 저장된 경우가 섞여 있으면 그대로 표시
      timeSpan.textContent = record.timestamp;
    } else {
      timeSpan.textContent = "";
    }

    rightBox.appendChild(timeSpan);

    header.appendChild(leftBox);
    header.appendChild(rightBox);

    const messageP = document.createElement("p");
    messageP.className = "record-message";
    messageP.textContent = record.message;

    item.appendChild(header);
    item.appendChild(messageP);

    if (record.imageUrl) {
      const img = document.createElement("img");
      img.className = "record-photo";  // 기존 CSS에 맞춰서 유지
      img.src = record.imageUrl;
      img.alt = "인증 사진";
      item.appendChild(img);
    }

    recordsContainer.appendChild(item);
  });
}


/* ==============================
   4. 화면 전환 및 카메라
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

async function startCamera() {
  cameraErrorText.textContent = "";

  try {
    if (currentStream) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },  // 후면 카메라 우선
        // ✅ 해상도 요청(HD 이상) → 글자가 훨씬 또렷해짐
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    currentStream = stream;
    video.srcObject = stream;
    video.style.display = "block";
    canvas.style.display = "none";
    cameraOverlayText.textContent = "화면을 확인한 뒤, 사진 찍기를 눌러주세요.";

    // ✅ 일부 브라우저에서만 동작: 자동 초점(continuous focus) 시도
    const [track] = stream.getVideoTracks();
    if (track && track.applyConstraints) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" }],
        });
        console.log("focusMode=continuous 적용 시도");
      } catch (e) {
        console.log("focusMode 설정 미지원 또는 실패:", e);
      }
    }
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

function capturePhoto() {
  if (!currentStream) {
    cameraErrorText.textContent =
      "카메라가 활성화되어 있지 않습니다. 권한을 확인해 주세요.";
    return;
  }

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  if (!videoWidth || !videoHeight) {
    cameraErrorText.textContent =
      "영상이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.";
    return;
  }

  // ✅ targetRatio: 화면에 보이는 카메라 박스 비율
  //   - 우선 video 요소의 실제 표시 크기를 써보고,
  //   - 그게 0이면(아직 계산 안 됐으면) 원본 비율 사용
  let targetRatio;
  if (video.clientWidth > 0 && video.clientHeight > 0) {
    targetRatio = video.clientWidth / video.clientHeight;
  } else {
    targetRatio = videoWidth / videoHeight;
  }

  const videoRatio = videoWidth / videoHeight;

  let srcW, srcH, sx, sy;

  if (videoRatio > targetRatio) {
    // 영상이 더 "넓은" 경우 → 좌우를 잘라낸다
    srcH = videoHeight;
    srcW = srcH * targetRatio;
    sx = (videoWidth - srcW) / 2;
    sy = 0;
  } else {
    // 영상이 더 "세로로 긴" 경우 → 위아래를 잘라낸다
    srcW = videoWidth;
    srcH = srcW / targetRatio;
    sx = 0;
    sy = (videoHeight - srcH) / 2;
  }

  // 🔹 캔버스 크기를 잘라낼 비율에 맞춰서 설정
  canvas.width = srcW;
  canvas.height = srcH;

  const ctx = canvas.getContext("2d");
  // 원본 영상의 가운데 영역만 캔버스에 그리기
  ctx.drawImage(
    video,
    sx,
    sy,
    srcW,
    srcH,
    0,
    0,
    canvas.width,
    canvas.height
  );

  try {
    lastCapturedImageDataUrl = canvas.toDataURL("image/jpeg", 0.8);
    console.log("📸 캡처 완료, dataURL 길이:", lastCapturedImageDataUrl.length);
  } catch (e) {
    console.error("toDataURL error:", e);
    lastCapturedImageDataUrl = null;
  }

  video.style.display = "none";
  canvas.style.display = "block";
  cameraOverlayText.textContent = "사진이 저장되었습니다. 다시 찍을 수도 있어요.";
}


function retakePhoto() {
  if (!currentStream) {
    startCamera();
    return;
  }
  video.style.display = "block";
  canvas.style.display = "none";
  cameraOverlayText.textContent = "화면을 확인한 뒤, 사진 찍기를 눌러주세요.";
}

/* ==============================
   5. 랜덤 문구 (Google Sheets + 커스텀)
   ============================== */

// 커스텀 문구 (예비용)
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
    { text: "작은 습관이 큰 변화를 만든다.", author: "제임스 클리어" },
    { text: "완벽보다 ‘시작’이 더 중요하다.", author: "작자 미상" },
    { text: "한 걸음씩, 매일 조금씩 나아가기.", author: "" },
  ],
};

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

const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSh1gCwxn3vy9Nv0OqjUlrKr68Ix6efjPRqvFq4a64KrOhmJrtomxpNun4TTLzdD3Fz_S-ikFqfotDx/pub?output=csv"; // 여기에 Google Sheets CSV 공개 URL 넣기

// CSV 파서
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
        // ignore
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

function mapTypeToCategoryKey(type) {
  const t = (type || "").trim().toLowerCase();

  if (t === "미션" || t === "mission") return "missions";
  if (t === "응원" || t === "cheer" || t === "support") return "cheers";
  if (t === "명언" || t === "quote") return "quotes";
  return null;
}

async function loadRandomMessagesFromSheet() {
  if (!SHEETS_CSV_URL || SHEETS_CSV_URL.trim() === "") {
    // 시트 URL이 없으면 그냥 비워둔 채로 상태만 표시
    randomMessages.missions = [];
    randomMessages.cheers  = [];
    randomMessages.quotes  = [];
    showRandomMessage();
    return;
  }

  try {
    const res = await fetch(`${SHEETS_CSV_URL}&cache=${Date.now()}`);
    const text = await res.text();
    let rows = parseCsv(text);

    rows = rows.filter((row) =>
      row.some((cell) => (cell || "").trim().length > 0)
    );

    if (!rows.length) throw new Error("시트 내용이 비어 있습니다.");

    randomMessages.missions = [];
    randomMessages.cheers = [];
    randomMessages.quotes = [];

    // CSV 첫 셀에 붙을 수 있는 BOM(﻿) 제거 + 양쪽 공백 제거
    const headerCells = rows[0].map((c) =>
      (c || "").replace(/^\uFEFF/, "").trim()
    );

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
          randomMessages.quotes.push({ text: textVal, author: authorVal });
        }
      }
    }

    const totalCount =
      randomMessages.missions.length +
      randomMessages.cheers.length +
      randomMessages.quotes.length;

  // 이제는 시트에 아무 것도 없으면 그냥 "문구 없음"만 표시하도록 두고,
  // 커스텀 문구는 더 이상 사용하지 않는다.

    showRandomMessage();
  } catch (error) {
    console.error("Failed to load CSV:", error);
    // 에러가 나면 배열을 비워두고 "문구 없음" 상태만 표시
    randomMessages.missions = [];
    randomMessages.cheers  = [];
    randomMessages.quotes  = [];
    showRandomMessage();
  }
}

function showRandomMessage() {
  const availableCategories = [];
  if (randomMessages.missions.length) availableCategories.push("missions");
  if (randomMessages.cheers.length) availableCategories.push("cheers");
  if (randomMessages.quotes.length) availableCategories.push("quotes");

  if (!availableCategories.length) {
    randomCategoryLabel.textContent = "문구 없음";
    randomMessageText.textContent = "CUSTOM_MESSAGES에 문구를 추가해 주세요.";
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

  if (categoryKey === "missions") body.classList.add("theme-mission");
  else if (categoryKey === "cheers") body.classList.add("theme-cheer");
  else if (categoryKey === "quotes") body.classList.add("theme-quote");
}

/* ==============================
   6. 토스트 & 관리자 모드
   ============================== */

function showSuccessToast() {
  if (!successToast) return;
  successToast.classList.remove("show");
  void successToast.offsetWidth;
  successToast.classList.add("show");
}

//관리자 모드 함수 토글은 삭제함
// 🗑 선택 삭제(관리자용) 버튼 클릭 핸들러
if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener("click", async () => {
    try {
     // 1) 관리자 확인
        await ensureAdminOnce();
     } catch (e) {
     // 로그인 실패 또는 취소
     return;
     }

     // 2) 첫 클릭이면 "선택 모드"로 전환만 하고 안내
     if (!isAdminSelectionMode) {
     isAdminSelectionMode = true;
     document.body.classList.add("admin-selection-mode");
      // 전체 삭제 버튼도 이때부터 보이게
        if (btnDeleteAllRecords) {
       btnDeleteAllRecords.style.display = "inline-block";
     }
     alert(
       "삭제할 인증을 선택한 뒤,\n다시 한 번 '선택 삭제(관리자용)' 버튼을 눌러 주세요."
     );
     return;
     }

     // 3) 이미 선택 모드라면 실제 삭제 수행
    const checked = document.querySelectorAll(".record-select:checked");
    if (!checked.length) {
      alert("삭제할 인증을 먼저 선택해 주세요.");
     return;
     }

     if (!confirm(`선택한 ${checked.length}개의 인증을 삭제할까요?`)) {
     return;
     }

     try {
     const deletePromises = [];
     checked.forEach((cb) => {
       const docId = cb.dataset.docId;
          const imagePath = cb.dataset.imagePath || "";
       deletePromises.push(deleteRecordById(docId, imagePath));
     });
     await Promise.all(deletePromises);

     alert("선택한 인증이 삭제되었습니다.");
     } catch (e) {
     console.error("선택 삭제 중 오류:", e);
     alert("선택 삭제 중 오류가 발생했습니다.");
     } finally {
     // 선택 모드 해제
     isAdminSelectionMode = false;
     document.body.classList.remove("admin-selection-mode");
     if (btnDeleteAllRecords) {
       btnDeleteAllRecords.style.display = "none";
     }
     // 최신 목록 다시 불러오기
     await renderRecords();
     // 관리자 로그인 유지/해제는 상황에 따라 선택
        // 한 번 한 번 확인하고 싶다면 아래 주석을 풀어 사용:
     // await signOut(auth);
     // await ensureAnonymousLogin();
      }
    });
}    

// 🗑 모든 기록 전체 삭제 (관리자용) 버튼
if (btnDeleteAllRecords) {
    btnDeleteAllRecords.addEventListener("click", async () => {
    try {
        // 1) 관리자 확인
     await ensureAdminOnce();
      } catch (e) {
     return;
    }

     if (
        !confirm(
         "정말 모든 인증 기록을 삭제할까요?\n(오늘 기록까지 포함하여 전체 삭제됩니다.)"
     )
     ) {
        return;
    }

     try {
        // certifications 컬렉션 전체 조회
        const snap = await getDocs(collection(db, "certifications"));
        const deletePromises = [];
        snap.forEach((docSnap) => {
         const data = docSnap.data();
         const imagePath = data.imagePath || "";
         deletePromises.push(deleteRecordById(docSnap.id, imagePath));
        });

        await Promise.all(deletePromises);
        alert("모든 인증 기록이 삭제되었습니다.");

        // 선택 모드도 초기화
     isAdminSelectionMode = false;
     document.body.classList.remove("admin-selection-mode");
     btnDeleteAllRecords.style.display = "none";

     await renderRecords();
        // 필요하면 여기서도 signOut + 익명로그인으로 되돌릴 수 있음
     } catch (e) {
     console.error("전체 삭제 중 오류:", e);
     alert("전체 삭제 중 오류가 발생했습니다.");
     }
    });
}


/* ==============================
   7. 이벤트 바인딩 & 초기화
   ============================== */

// 화면 전환 버튼들
btnGoCertify.addEventListener("click", () => showView("certify"));
btnGoList.addEventListener("click", () => showView("list"));
btnBackFromCertify.addEventListener("click", () => showView("main"));
btnBackFromList.addEventListener("click", () => showView("main"));

// 카메라 버튼
btnTakePhoto.addEventListener("click", capturePhoto);
btnRetakePhoto.addEventListener("click", retakePhoto);

// 초기화 함수 (랜덤문구 + 익명로그인 + 첫 화면)
async function init() {
  await ensureAnonymousLogin();
  await loadRandomMessagesFromSheet();
  showView("main");

  // ✅ HTML의 <form id="ccertifyForm"> 와 맞추기
  const certifyFormEl = document.getElementById("certifyForm");

  if (!certifyFormEl) {
    console.warn(
      "❌ certifyForm 요소를 찾지 못했습니다. index.html에서 <form id=\"certifyForm\"> 인지 확인해 주세요."
    );
    return;
  }

  console.log("✅ certifyForm found, submit handler attached.");

  certifyFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    console.log("📩 submit fired");

    const nickname = nicknameInput.value.trim();
    const message  = messageInput.value.trim();
    const imageDataUrl = lastCapturedImageDataUrl || null;

    console.log("📸 imageDataUrl 존재 여부:", !!imageDataUrl);

    if (!nickname || !message) {
      alert("닉네임과 인증 문구를 모두 입력해 주세요.");
      return;
    }

    try {
      console.log("🔥 addCertificationToFirebase 호출 직전");
      await addCertificationToFirebase(
        nickname,
        message,
        null,          // missionType (지금은 사용 안 해서 null)
        imageDataUrl   // ✅ 사진 dataURL 넘기기
      );
      console.log("✅ addCertificationToFirebase 완료");

      alert("인증이 저장되었습니다! 🎉");

      // 입력값 초기화
      nicknameInput.value = "";
      messageInput.value = "";
      lastCapturedImageDataUrl = null;

      // 인증자 목록 화면으로 이동 + 새로 렌더
      showView("list");
      await renderRecords();
    } catch (e) {
      console.error("❌ 인증 저장 중 오류:", e);
      alert("인증 저장 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);


// DOMContentLoaded 시점에 init 실행
document.addEventListener("DOMContentLoaded", init);






