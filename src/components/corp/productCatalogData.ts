type ProductScreen = {
  src: string;
  alt: string;
  title: string;
  description: string;
};

type CatalogItem = {
  id: string;
  name: string;
  summary: string;
  description: string;
  includes: readonly string[];
  delivery: string;
  image: string;
  imageAlt: string;
  isCy?: boolean;
  screens?: readonly ProductScreen[];
};

type CatalogCategory = {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  accent: string;
  products: readonly CatalogItem[];
};

const CATALOG = [
  {
    id: 'web-app',
    label: '웹·앱 제품',
    eyebrow: 'WEB APP PRODUCT',
    description: '사용자가 바로 쓰고 운영자가 계속 관리할 수 있는 웹 제품 패키지입니다.',
    accent: '#60a5fa',
    products: [
      {
        id: 'web-product-starter',
        name: '웹제품 스타터',
        summary: '아이디어를 검증 가능한 첫 제품으로 만듭니다.',
        description: '핵심 사용자 흐름과 운영 화면을 먼저 정리해, 실제 사용자의 반응을 빠르게 확인할 수 있는 웹 제품을 구축합니다.',
        includes: ['핵심 화면·사용자 흐름 설계', '로그인·권한·기본 데이터 구조', '운영자 관리 화면'],
        delivery: '맞춤 견적 · 도입 상담 후 범위 확정',
        image: '/images/corp/technology/web-app-stack.webp',
        imageAlt: '웹 제품의 기술 구성을 보여주는 인포그래픽',
      },
      {
        id: 'web-operations-dashboard',
        name: '운영 대시보드',
        summary: '흩어진 업무 현황을 한 화면에서 판단합니다.',
        description: '사용자, 작업, 요청, 성과 데이터를 운영 기준에 맞춰 모아 보고 다음 행동을 빠르게 결정할 수 있도록 돕습니다.',
        includes: ['업무 현황·알림 대시보드', '역할별 조회와 관리 권한', '운영 지표와 이력 화면'],
        delivery: '맞춤 견적 · 데이터 범위 진단 포함',
        image: '/images/corp/workflows/web-app-delivery-process.webp',
        imageAlt: '운영형 웹 서비스의 기획부터 배포까지 이어지는 과정',
      },
      {
        id: 'web-customer-portal',
        name: '고객 포털',
        summary: '고객이 필요한 정보를 스스로 찾고 처리하게 합니다.',
        description: '문의, 자료, 진행 상태와 공지 접점을 하나의 포털에 연결해 고객 경험과 담당자의 응대 부담을 함께 정리합니다.',
        includes: ['고객별 자료·진행 상태', '문의·공지·알림 흐름', '관리자 응대 도구'],
        delivery: '맞춤 견적 · 고객 여정 설계 포함',
        image: '/images/corp/technology/secure-stack.webp',
        imageAlt: '안전한 고객 포털 운영에 필요한 기술 구조 인포그래픽',
      },
      {
        id: 'web-ai-assistant',
        name: 'AI 업무 도우미',
        summary: '정보를 찾고 정리하는 첫 단계를 제품 안으로 가져옵니다.',
        description: '내부 문서와 운영 데이터를 바탕으로 검색, 요약, 초안 작성과 다음 행동 제안을 연결해 사용자의 판단을 지원합니다.',
        includes: ['AI 검색·요약 경험 설계', '자료 범위와 권한 연결', '검토·수정 가능한 응답 흐름'],
        delivery: '맞춤 견적 · 적용 데이터 사전 점검',
        image: '/images/corp/technology/creator-stack.webp',
        imageAlt: 'AI 도우미가 연결되는 서비스 기술 구성 인포그래픽',
      },
      {
        id: 'cy-field-report',
        name: 'CY 모바일 현장일보 웹앱',
        summary: '현장·팀·작업자·공수·단가를 한 장부에서 입력하고 저장합니다.',
        description: 'CY에서 실제 구동 중인 일보 등록 화면을 기반으로, 종이·메신저·엑셀에 흩어진 현장 기록을 반응형 웹으로 구축합니다. 건설·설비·시설관리처럼 매일 작업 근거를 남겨야 하는 조직에 적합합니다.',
        includes: ['현장·팀·작업자·공종·공수 입력과 장부 저장', '카톡 작업내용 분석과 관리자 검토 흐름', '일보 목록·개인달력·노임 체크·PDF 출력 확장'],
        delivery: '기본형 4~6주 · 알림·전자서명·기존 데이터 연동 시 6~10주',
        image: '/images/corp/products/cy/daily-report.png',
        imageAlt: 'CY에서 실제 구동되는 일보 등록 스프레드시트 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/field-schedule-board.jpg',
            alt: '날짜별 현장과 팀 작업 일정을 카드로 배치한 CY 현장 일정 보드',
            title: '현장 일정 보드',
            description: '날짜를 기준으로 현장별 배정 인원과 지원팀, 작업 상태를 카드로 비교해 당일 배치 충돌과 누락을 빠르게 확인합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/output-records-list.jpg',
            alt: '현장명과 작업자별 공수 및 금액을 조회하는 CY 출력목록 화면',
            title: '출력일보 통합 목록',
            description: '현장·팀·작업자·급여 형식별 필터와 기간 합계를 제공해 일보 입력 결과를 공수 및 금액 기준으로 검토하고 엑셀로 전달합니다.',
          },
        ],
      },
      {
        id: 'cy-workforce-database',
        name: 'CY 인력·자격·배치 통합DB',
        summary: '작업자·사무원·팀·현장·회사·계좌 정보를 하나의 기준으로 연결합니다.',
        description: '여러 담당자의 파일에 흩어진 인력과 현장 정보를 검색 가능한 통합 데이터베이스로 전환합니다. 자격 만료, 미배정 작업자, 계좌 누락과 데이터 중복을 관리 화면에서 빠르게 확인할 수 있습니다.',
        includes: ['작업자·사무원·팀·현장·회사·계좌 통합 관리', '미배정·미등록·중복 데이터 무결성 진단', '권한별 조회와 엑셀 이관·출력'],
        delivery: '기본형 5~7주 · 기존 자료 정제·이관 포함 7~10주',
        image: '/images/corp/products/cy/workforce-database.png',
        imageAlt: 'CY에서 실제 구동되는 통합 데이터베이스와 데이터 무결성 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/worker-detail.jpg',
            alt: '작업자 목록과 월 공수 및 금액을 함께 보여주는 CY 팀별 작업자 상세 화면',
            title: '팀별 작업자 상세정보',
            description: '팀 소속 작업자의 재직 상태, 월 공수, 월 금액과 기본 인적·계좌 정보를 한 화면에서 확인해 배치와 정산의 기준정보로 사용합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/employment-certificate.jpg',
            alt: '근로자 선택 정보로 재직증명서를 미리 보는 CY 문서 발급 화면',
            title: '재직증명서 자동 발급',
            description: '작업자 기준정보를 문서 양식에 자동 반영하고 발급 목적·직위·담당업무를 입력해 인쇄 또는 PDF로 저장합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/termination-certificate.jpg',
            alt: '퇴직일과 사유를 반영한 CY 해촉증명서 미리보기 화면',
            title: '해촉증명서 자동 발급',
            description: '소속·용역 기간·해촉일·용도를 연결해 퇴직 관련 증명서를 동일한 회사 양식과 직인으로 빠르게 발급합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/delegation-generator.jpg',
            alt: '현장과 작업자를 선택해 위임장 문서를 만드는 CY 위임장 생성기 화면',
            title: '현장 위임장 생성기',
            description: '기준 현장과 작업자 목록을 불러와 수임 범위와 서명을 배치하고, 제출용 위임장을 표준 양식으로 생성합니다.',
          },
        ],
      },
      {
        id: 'cy-dashboard-starter',
        name: 'CY 운영 대시보드 스타터',
        summary: '기존 업무 데이터를 대표와 관리자용 판단 화면으로 바꿉니다.',
        description: '전면 ERP 교체 전에 작업자·현장·팀·일보 현황부터 한 화면에 통합하는 스타터 제품입니다. 기존 엑셀을 유지하면서 필요한 데이터만 먼저 연결해 단계적으로 확장합니다.',
        includes: ['역할별 핵심 지표와 확인 필요 업무', '현황 카드에서 상세 데이터로 이어지는 조회 흐름', '초기 데이터 이관과 후속 ERP 확장 로드맵'],
        delivery: '업무 진단 1주 + 스타터 구축 5~8주',
        image: '/images/corp/products/cy/workforce-database.png',
        imageAlt: 'CY 운영 대시보드 기반의 통합 데이터 현황 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/integrated-status-board.jpg',
            alt: '현장별 공수와 팀 배치 상태를 카드로 비교하는 CY 통합 현황판',
            title: '현장·팀 통합 현황판',
            description: '전체 공수와 팀별 배치, 지원 상태를 현장 카드 단위로 요약해 운영자가 오늘 확인해야 할 현장을 바로 찾게 합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/daily-work-analytics.jpg',
            alt: '일별 공수 추이와 비용 구성 및 상위 현장을 시각화한 CY 업무 통계 화면',
            title: '일일 업무 보고 통계 분석',
            description: '기간별 공수·인건비·작업자 수를 추이와 비용 분포로 시각화하고, 상위 팀과 현장을 비교해 관리 판단을 지원합니다.',
          },
        ],
      },
      {
        id: 'cy-integrated-suite',
        name: 'CY 통합 운영 ERP',
        summary: '현장·인력·급여·증빙을 하나의 계정과 데이터 흐름으로 연결합니다.',
        description: 'CY에 구현된 현황관리, 출력일보, 급여정산, 통합DB, 세금관리 구조를 고객사의 업무 규칙에 맞춰 단계적으로 구축합니다. 완성 SaaS를 그대로 재판매하는 방식이 아니라 우선 모듈부터 설계·검수·납품하는 통합 확장형 상품입니다.',
        includes: ['현장·인력·급여·증빙 모듈과 통합 권한', '기존 엑셀·ERP·회계 데이터 이관 및 선택 연동', '운영자 교육·검수 결과서·후속 개선 백로그'],
        delivery: '진단 2~3주 · 1차 모듈 8~12주 · 전체 범위 단계 협의',
        image: '/images/corp/products/cy/payroll-settlement.png',
        imageAlt: 'CY 통합 운영 ERP의 실제 팀정산 통계 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/vehicle-management.jpg',
            alt: '차량 상태와 보험 및 정비 정보를 통합 조회하는 CY 차량 관리 화면',
            title: '차량 통합관리',
            description: '차량·보험·정비·사고·청구 정보를 연결하고 만료일과 처리 상태를 색상 태그로 보여줘 운영 자산 누락을 줄입니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/team-settlement-statistics.jpg',
            alt: '월별 팀 수입과 지출 및 정산 차액을 비교하는 CY 팀정산 통계 화면',
            title: '월별 팀정산 통계',
            description: '팀별 수입·지출·손익·현장 공수·인원 공수를 한 표에 집계하고 엑셀·PDF로 내보내 월마감 자료를 표준화합니다.',
          },
        ],
      },
    ],
  },
  {
    id: 'automation',
    label: '업무자동화',
    eyebrow: 'BUSINESS AUTOMATION',
    description: '반복 업무는 줄이고 사람의 판단은 더 선명하게 남기는 자동화 패키지입니다.',
    accent: '#5eead4',
    products: [
      {
        id: 'automation-document',
        name: '문서 처리 자동화',
        summary: '받은 문서를 읽고 분류하고 필요한 곳으로 보냅니다.',
        description: '메일·PDF·스프레드시트에 들어온 정보를 정리해 담당자 확인과 다음 업무로 자연스럽게 이어지도록 구성합니다.',
        includes: ['문서 수집·분류·정보 추출', '담당자 확인과 예외 처리', '처리 이력과 재실행 기준'],
        delivery: '맞춤 견적 · 현행 문서 흐름 진단',
        image: '/images/corp/workflows/business-automation-process.webp',
        imageAlt: '문서 기반 업무 자동화의 전체 과정 인포그래픽',
      },
      {
        id: 'automation-approval',
        name: '승인·알림 자동화',
        summary: '지연되기 쉬운 승인과 알림을 역할에 맞춰 연결합니다.',
        description: '요청, 검토, 승인, 보류와 알림을 하나의 규칙으로 만들고 필요한 담당자만 정확한 시점에 참여하도록 설계합니다.',
        includes: ['역할별 승인 단계 설계', '상태 변경·알림 규칙', '보류·반려·재요청 흐름'],
        delivery: '맞춤 견적 · 승인 규칙 워크숍 포함',
        image: '/images/corp/technology/automation-stack.webp',
        imageAlt: '승인과 알림 자동화에 필요한 기술 구조 인포그래픽',
      },
      {
        id: 'automation-data-sync',
        name: '데이터 연결 자동화',
        summary: '여러 시스템의 같은 정보를 한 번에 관리합니다.',
        description: '서로 다른 서비스와 스프레드시트의 데이터를 필요한 주기에 맞춰 연결하고, 중복 입력과 누락 확인을 줄입니다.',
        includes: ['API·스프레드시트 연동', '동기화 주기와 오류 감지', '실행 로그와 복구 기준'],
        delivery: '맞춤 견적 · 연동 대상 사전 확인',
        image: '/images/corp/technology/secure-stack.webp',
        imageAlt: '안전한 데이터 연결과 권한 관리 구조 인포그래픽',
      },
      {
        id: 'automation-ai-workflow',
        name: 'AI 워크플로',
        summary: '사람이 검토할 수 있는 AI 업무 흐름을 만듭니다.',
        description: '요약, 분류, 초안 작성 같은 AI 작업을 업무 단계 안에 배치하고 최종 판단과 수정 권한은 담당자에게 남깁니다.',
        includes: ['AI 작업 단계와 검토 지점', '입력·출력 검증 기준', '실행 이력과 개선 루프'],
        delivery: '맞춤 견적 · AI 적용 가능성 진단',
        image: '/images/corp/technology/creator-stack.webp',
        imageAlt: 'AI 워크플로 구성에 활용되는 기술 인포그래픽',
      },
      {
        id: 'cy-payroll-settlement',
        name: 'CY 근무·급여·수당 정산',
        summary: '월별 수입·지출·공수·단가와 팀 정산 근거를 한 화면에서 검토합니다.',
        description: '현장과 팀마다 다른 근무·수당·공제 규칙을 계산 가능한 웹 흐름으로 바꾸고, 수정 사유와 월별 확정 이력을 남깁니다. 월말마다 여러 엑셀을 대조하는 조직에 적합합니다.',
        includes: ['월별 팀 정산·현장 공수·인원 공수 통계', '수입·지출·공제·추가 계산과 차이 검토', '엑셀·PDF 출력과 월마감 이력'],
        delivery: '규칙 진단 1~2주 + 구축 7~12주',
        image: '/images/corp/products/cy/payroll-settlement.png',
        imageAlt: 'CY에서 실제 구동되는 팀정산 통계 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/payroll-settlement-sheet.jpg',
            alt: '작업자별 공수와 단가 및 변동 실수령액을 계산하는 CY 팀별 급여 정산표',
            title: '팀별 급여 정산표',
            description: '작업자별 공수·단가·세전 금액과 가불·공제 항목을 한 장부에서 계산하고 팀별 실수령액을 검토합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/labor-cost-report.jpg',
            alt: '현장별 공수와 노무비 및 작업자 현황을 보여주는 CY 노임명세서 출력일보 화면',
            title: '현장별 노임명세서·출력일보',
            description: '현장별 누적 공수·노무비·작업자 수와 현황을 묶어 정산 근거를 만들고 CSV·인쇄 자료로 전달합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/team-expense-breakdown.jpg',
            alt: '팀별 숙소와 차량 및 카드 경비를 항목별로 집계한 CY 경비내역 화면',
            title: '팀별 경비내역 집계',
            description: '숙소·차량·카드·개인경비를 팀별로 합산하고 세부 지출을 연결해 급여 외 비용까지 정산 결과에 반영합니다.',
          },
        ],
      },
      {
        id: 'cy-tax-invoice',
        name: 'CY 세금계산서·미수금 관리',
        summary: '발행액·입금액·미수금·연체 현황을 발행 기록과 연결합니다.',
        description: '발행 요청이 메신저와 메일에 흩어지는 문제를 줄이고, 거래처별 발행·입금·미수 상태를 한 화면에서 관리합니다. 제품 화면은 개인정보가 없는 CY 미수금 대시보드의 실제 구동 상태입니다.',
        includes: ['세금계산서 발행 요청·발행 이력·거래장', '총 발행액·입금액·미수금·30일 초과 연체 지표', '입금 등록·미수금 관리와 외부 발행 API 선택 연동'],
        delivery: '관리형 4~6주 · 홈택스·외부 발행 연동은 범위 협의',
        image: '/images/corp/products/cy/tax-invoice.png',
        imageAlt: 'CY에서 실제 구동되는 세금계산서 미수금 대시보드 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/tax-invoice-list.jpg',
            alt: '발행 준비와 대기 및 완료 상태를 관리하는 CY 세금계산서 발행 리스트',
            title: '세금계산서 발행 리스트',
            description: '발행 요청을 준비·대기·완료·이월 상태로 구분하고 공급가와 세액, 현장, 결제 정보를 한 목록에서 검토합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/purchase-sales-input.jpg',
            alt: '거래처와 현장별 공급가액 및 부가세를 입력하는 CY 매입매출 데이터 시트',
            title: '매입·매출 입력 시트',
            description: '날짜·거래처·현장·공수·공급가액·부가세·입금액을 표준 열로 입력해 세금계산서와 회계 자료의 원천 데이터를 정리합니다.',
          },
        ],
      },
      {
        id: 'cy-monthly-closing',
        name: 'CY 증빙 누락·월마감 자동화',
        summary: '마감 전에 빠진 발행·입금·증빙과 담당 업무를 먼저 찾습니다.',
        description: '월말 직전에 누락 자료를 발견하는 대신 발행·수금·증빙 상태를 실시간으로 모아 담당자 확인과 마감 순서를 안내합니다. 회계 폴더·메일·외부 시스템 연결은 선택 범위로 제공합니다.',
        includes: ['마감 진행률과 누락·검토 필요 목록', '담당자 요청·알림·승인·반려 흐름', '월별 보관함·정기 리포트·OCR 선택 확장'],
        delivery: '기본형 4~7주 · 자동 수집형 7~11주',
        image: '/images/corp/products/cy/tax-invoice.png',
        imageAlt: 'CY 미수금 현황을 활용한 월마감 관리 실제 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/estimate-system.jpg',
            alt: '품목별 수량과 단가 및 임대료를 계산하는 CY 견적서 시스템',
            title: '견적서 관리 시스템',
            description: '고객·프로젝트 정보와 품목별 인건비·임대료를 계산해 공급가액과 부가세가 포함된 견적서를 생성하고 이력을 관리합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/transaction-statement.jpg',
            alt: '공급자와 공급받는 자 및 품목 내역을 표시하는 CY 거래명세표',
            title: '거래명세표 관리',
            description: '거래처별 품목·수량·단가·세액을 표준 거래명세표로 만들고 발행·확정·관리 상태를 견적 이력과 연결합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/statement-generator.jpg',
            alt: '작업자별 날짜와 공수 및 금액을 자동 집계하는 CY 노무내역서 생성기',
            title: '노무내역서 자동 생성',
            description: '선택한 작업자의 일자별 공수와 단가를 표 양식에 자동 반영하고 총액을 검산해 월마감 제출용 문서를 만듭니다.',
          },
        ],
      },
      {
        id: 'cy-progress-board',
        name: 'CY 공정·이슈·사진 자동화 보드',
        summary: '현장 문제를 담당자·기한·완료 근거와 연결합니다.',
        description: '현장 실행기록과 출력일보 구조를 기반으로 공정 지연, 조치 항목, 전후 사진과 승인 상태를 한 보드에서 관리하도록 맞춤 구축합니다. 채팅방에 묻히는 이슈를 운영 가능한 업무 이력으로 전환합니다.',
        includes: ['공정·이슈 등록과 담당·기한·우선순위', '사진·문서 첨부와 조치 댓글·완료 승인', '마감 알림·주간 리포트·협력사 제한 계정'],
        delivery: '기본형 5~7주 · 협업 확장형 8~12주',
        image: '/images/corp/products/cy/daily-report.png',
        imageAlt: 'CY 현장일보 입력 구조를 활용한 공정 기록 실제 화면',
        isCy: true,
        screens: [
          {
            src: '/images/corp/products/cy/gallery/team-expense-detail.jpg',
            alt: '팀별 숙소와 차량 및 카드 경비 상세를 보여주는 CY 비용 관리 화면',
            title: '숙소·차량·카드·경비 상세',
            description: '팀 운영에 필요한 숙소·차량·카드 비용과 상세 거래내역을 한 화면에 묶어 현장별 비용 근거와 처리 상태를 추적합니다.',
          },
          {
            src: '/images/corp/products/cy/gallery/photo-client-registration.jpg',
            alt: '사진을 분석해 거래처 후보를 등록하는 CY 사진 거래처 등록 화면',
            title: '사진 기반 거래처 등록',
            description: '명함과 현장 자료 사진을 업로드하면 AI가 회사 정보를 인식해 거래처 후보로 정리하고 담당자가 검토 후 등록합니다.',
          },
        ],
      },
    ],
  },
  {
    id: 'media',
    label: '영상 제작·편집',
    eyebrow: 'MEDIA PRODUCTION',
    description: '설명해야 할 메시지를 사람들이 끝까지 보는 영상 경험으로 만드는 패키지입니다.',
    accent: '#fb7185',
    products: [
      {
        id: 'media-product-film',
        name: '제품 소개 영상',
        summary: '복잡한 제품의 가치를 짧고 선명한 장면으로 설명합니다.',
        description: '핵심 고객과 사용 장면을 정리한 뒤, 스토리보드와 편집을 통해 제품의 다음 행동이 자연스럽게 보이는 영상을 만듭니다.',
        includes: ['메시지·스토리보드 기획', 'AI·촬영 소스 구성', '편집·자막·최종 납품'],
        delivery: '맞춤 견적 · 용도와 채널 기준 협의',
        image: '/images/corp/technology/video-stack.webp',
        imageAlt: '제품 소개 영상 제작에 활용되는 기술 구성 인포그래픽',
      },
      {
        id: 'media-short-form',
        name: '숏폼 콘텐츠 패키지',
        summary: '하나의 메시지를 여러 채널에 맞게 나눕니다.',
        description: '긴 이야기에서 채널별 핵심 장면을 추려 짧은 영상 시리즈로 구성하고, 게시 환경에 맞는 버전까지 정리합니다.',
        includes: ['채널별 편집 구성안', '세로형·가로형 버전 제작', '자막·썸네일 가이드'],
        delivery: '맞춤 견적 · 채널 운영 계획 연동',
        image: '/images/corp/workflows/video-editing-workflow.webp',
        imageAlt: '영상 편집과 배포까지 이어지는 워크플로 인포그래픽',
      },
      {
        id: 'media-education',
        name: '교육·온보딩 영상',
        summary: '처음 쓰는 사람도 따라 할 수 있게 만듭니다.',
        description: '업무 절차와 제품 사용법을 짧은 장면 단위로 나눠, 담당자 교육과 고객 온보딩에 바로 쓸 수 있는 영상으로 구성합니다.',
        includes: ['학습 흐름과 화면 구성', '내레이션·자막·그래픽', '업데이트 가능한 편집 원본'],
        delivery: '맞춤 견적 · 교육 대상별 난이도 설계',
        image: '/images/corp/workflows/creator-workflow.webp',
        imageAlt: '콘텐츠 기획과 제작, 운영을 연결하는 크리에이터 워크플로',
      },
      {
        id: 'media-brand-campaign',
        name: '브랜드 캠페인 영상',
        summary: '브랜드가 전하고 싶은 태도를 한 편의 이야기로 만듭니다.',
        description: '캠페인의 목적과 타깃, 공개 채널을 먼저 정리하고 영상·이미지·사운드를 하나의 톤으로 연결해 메시지의 밀도를 높입니다.',
        includes: ['캠페인 콘셉트와 제작 기획', '비주얼·음원·자막 품질 검수', '캠페인용 파생 소스'],
        delivery: '맞춤 견적 · 캠페인 일정 기준 협의',
        image: '/images/corp/technology/creator-stack.webp',
        imageAlt: '브랜드 콘텐츠 제작을 지원하는 기술 구성 인포그래픽',
      },
    ],
  },
  {
    id: 'partner',
    label: '크리에디터',
    eyebrow: 'CREEDITOR · CONTENT & COMMERCE',
    description: '생성형 콘텐츠를 판매 상품으로 만들고, 광고 콘텐츠를 스토어·제휴 상품 링크와 연결합니다.',
    accent: '#f5c766',
    products: [
      {
        id: 'partner-onboarding',
        name: '생성형 콘텐츠 판매 패키지',
        summary: '만든 영상·이미지·웹툰을 판매할 수 있는 상품으로 구성합니다.',
        description: '생성형 콘텐츠를 용도와 형식에 따라 묶고 미리보기, 사용 범위, 전달 파일을 정리해 구매자가 이해하기 쉬운 디지털 상품으로 만듭니다.',
        includes: ['영상·이미지·웹툰 상품 구성', '미리보기·상세 소개·사용 범위', '구매 후 파일 전달 흐름'],
        delivery: '맞춤 견적 · 콘텐츠와 판매 채널별 범위 협의',
        image: '/images/corp/workflows/creator-workflow.webp',
        imageAlt: '디지털 콘텐츠 기획과 제작, 운영을 연결하는 과정 인포그래픽',
      },
      {
        id: 'partner-portal',
        name: '광고형 상품 콘텐츠',
        summary: '제품의 매력을 숏폼·이미지·블로그 콘텐츠로 소개합니다.',
        description: '네이버스토어, 쿠팡파트너스, AliExpress, TEMU 등에서 소개할 상품에 맞춰 광고 소재를 기획하고 상품 정보와 구매·제휴 링크를 연결합니다.',
        includes: ['상품별 광고 영상·이미지·글', '채널에 맞는 구매 유도 문구', '상품 정보·링크·광고 표시 검수'],
        delivery: '맞춤 견적 · 상품과 채널별 제작 범위 협의',
        image: '/images/corp/technology/creator-stack.webp',
        imageAlt: '상품 소개 콘텐츠 제작을 지원하는 기술 구성 인포그래픽',
      },
      {
        id: 'partner-co-selling',
        name: '채널·상품 링크 운영',
        summary: '콘텐츠를 본 사람이 관심 있는 상품에 바로 도달하게 합니다.',
        description: 'YouTube, TikTok, Instagram, 블로그의 게시 형식에 맞춰 콘텐츠와 상품 링크를 배치하고 채널별 게시 일정과 링크 상태를 관리합니다.',
        includes: ['채널별 콘텐츠·게시 일정', '스토어·제휴 상품 링크 구성', '연결 상태와 상품 정보 점검'],
        delivery: '맞춤 견적 · 운영 채널과 상품 수 기준 협의',
        image: '/images/corp/workflows/video-editing-workflow.webp',
        imageAlt: '콘텐츠 편집에서 채널 배포까지 이어지는 과정 인포그래픽',
      },
      {
        id: 'partner-performance',
        name: '콘텐츠·판매 성과 대시보드',
        summary: '콘텐츠 반응과 판매 결과를 함께 보고 다음 제작을 결정합니다.',
        description: '확인 가능한 채널 조회·클릭, 콘텐츠 판매 내역과 플랫폼 제공 실적을 모아 어떤 소재와 상품을 개선할지 판단할 수 있게 구성합니다.',
        includes: ['조회·클릭·판매 지표 정리', '채널·소재·상품별 결과 비교', '다음 콘텐츠와 상품 개선 계획'],
        delivery: '맞춤 견적 · 제공 가능한 데이터 범위 확인',
        image: '/images/corp/technology/automation-stack.webp',
        imageAlt: '운영 데이터를 연결하는 자동화 기술 구성 인포그래픽',
      },
    ],
  },
] as const satisfies readonly CatalogCategory[];


type CategoryEntry = (typeof CATALOG)[number];
export type ProductCategoryId = CategoryEntry['id'];
export type ProductId<Category extends ProductCategoryId = ProductCategoryId> =
  Extract<CategoryEntry, { id: Category }>['products'][number]['id'];
export type ProductItem = Omit<CatalogItem, 'id'> & { id: ProductId };
export type ProductCategory = Omit<CatalogCategory, 'id' | 'products'> & {
  id: ProductCategoryId;
  products: readonly ProductItem[];
};

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = CATALOG;
const PRODUCTS_BY_ID = new Map<string, ProductItem>(
  PRODUCT_CATEGORIES.flatMap(({ products }) => products.map(product => [product.id, product] as const)),
);

export function findProductCategory(id: string) {
  return PRODUCT_CATEGORIES.find(category => category.id === id);
}

export function findProductById(id: string) {
  return PRODUCTS_BY_ID.get(id);
}

export function productInquiryHref(id: ProductId) {
  return `/corp/partnership/business?product=${id}`;
}
