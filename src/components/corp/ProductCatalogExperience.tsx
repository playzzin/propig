'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Code2,
  Film,
  Handshake,
  Layers3,
  ShieldCheck,
  ShoppingBag,
  Target,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import styled from 'styled-components';

type ProductScreen = {
  src: string;
  alt: string;
  title: string;
  description: string;
};

type ProductItem = {
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

type ProductCategory = {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  accent: string;
  icon: LucideIcon;
  products: readonly ProductItem[];
};

const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  {
    id: 'web-app',
    label: '웹·앱 제품',
    eyebrow: 'WEB APP PRODUCT',
    description: '사용자가 바로 쓰고 운영자가 계속 관리할 수 있는 웹 제품 패키지입니다.',
    accent: '#60a5fa',
    icon: Code2,
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
    icon: Workflow,
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
    icon: Film,
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
    label: '리셀러 파트너',
    eyebrow: 'RESELLER PARTNER',
    description: '파트너와 고객이 같은 제품 언어로 일하도록 돕는 운영 패키지입니다.',
    accent: '#f5c766',
    icon: Layers3,
    products: [
      {
        id: 'partner-onboarding',
        name: '파트너 온보딩 키트',
        summary: '첫 교육부터 운영 기준까지 빠르게 맞춥니다.',
        description: '계약, 권한, 제품 정보와 고객 지원 경로를 정리해 새 파트너가 같은 기준으로 제품을 소개하고 운영하게 합니다.',
        includes: ['온보딩 체크리스트', '제품·가격·운영 가이드', '지원·문의 채널 정리'],
        delivery: '맞춤 견적 · 파트너 운영 현황 진단',
        image: '/images/corp/workflows/reseller-partner-workflow.webp',
        imageAlt: '리셀러 파트너 온보딩과 운영의 전체 과정 인포그래픽',
      },
      {
        id: 'partner-portal',
        name: '파트너 포털',
        summary: '제품 자료와 고객 정보를 하나의 창구로 연결합니다.',
        description: '파트너가 필요한 카탈로그, 제안 자료, 교육 자료와 지원 요청을 한곳에서 확인하고 관리할 수 있게 구성합니다.',
        includes: ['파트너별 권한과 자료실', '문의·지원 요청 흐름', '운영자 관리 화면'],
        delivery: '맞춤 견적 · 운영 권한 설계 포함',
        image: '/images/corp/technology/reseller-partner-stack.webp',
        imageAlt: '리셀러 파트너 포털의 기술 구성 인포그래픽',
      },
      {
        id: 'partner-co-selling',
        name: '공동 영업 운영',
        summary: '상담부터 견적까지 다음 행동이 끊기지 않게 합니다.',
        description: '리드, 데모, 견적, 계약과 고객 지원 역할을 연결해 파트너와 내부 담당자가 같은 정보를 보며 움직이도록 설계합니다.',
        includes: ['리드·기회 관리 기준', '견적·데모 협업 흐름', '고객 지원 역할 분담'],
        delivery: '맞춤 견적 · 영업 흐름 워크숍 포함',
        image: '/images/corp/workflows/web-app-delivery-process.webp',
        imageAlt: '협업형 웹 제품을 만들고 운영하는 과정 인포그래픽',
      },
      {
        id: 'partner-performance',
        name: '파트너 성과 대시보드',
        summary: '매출뿐 아니라 고객 성공과 다음 기회를 함께 봅니다.',
        description: '리드 전환, 수주, 고객 지원과 교육 이력을 함께 확인해 파트너별 다음 지원과 확장 계획을 더 선명하게 만듭니다.',
        includes: ['성과·전환·지원 지표', '파트너별 운영 기록', '다음 분기 실행 계획'],
        delivery: '맞춤 견적 · 성과 지표 정의부터 지원',
        image: '/images/corp/technology/automation-stack.webp',
        imageAlt: '운영 데이터를 연결하는 자동화 기술 구성 인포그래픽',
      },
    ],
  },
];

const TOTAL_PRODUCT_COUNT = PRODUCT_CATEGORIES.reduce((total, category) => total + category.products.length, 0);

function getCyQuoteMailto(product: ProductItem): string {
  const subject = `[PRO PIG 웹개발 견적] ${product.name}`;
  const body = [
    '안녕하세요. CY 실제 구동 화면을 보고 웹개발 견적을 문의합니다.',
    '',
    `관심 상품: ${product.name}`,
    `예상 구축 기간: ${product.delivery}`,
    '',
    '회사명 / 업종:',
    '예상 사용자 수:',
    '현재 업무 방식과 가장 큰 불편:',
    '필요한 데이터 또는 외부 서비스 연동:',
    '희망 시작 시점:',
    '담당자 이름 / 연락처:',
  ].join('\n');
  return `mailto:support@propig.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const PARTNER_VALUE_PROPOSITIONS = [
  {
    icon: Target,
    label: '같은 영업 기준',
    description: '제품·가격·고객 대응 기준을 한 번에 맞춰 제안의 편차를 줄입니다.',
  },
  {
    icon: ShieldCheck,
    label: '운영 가능한 체계',
    description: '권한, 자료, 문의와 지원 경로를 정리해 담당자가 바뀌어도 흐름을 유지합니다.',
  },
  {
    icon: ChartNoAxesCombined,
    label: '함께 보는 성과',
    description: '리드와 수주뿐 아니라 교육·지원 이력을 연결해 다음 실행을 결정합니다.',
  },
] as const;

const PARTNER_JOURNEY = [
  ['01', '현황 진단', '제품과 기존 파트너 운영 방식을 확인합니다.'],
  ['02', '운영 설계', '역할·자료·고객 대응 기준을 함께 정의합니다.'],
  ['03', '온보딩 실행', '교육과 첫 공동 영업을 작은 범위부터 시작합니다.'],
  ['04', '성과 개선', '운영 기록을 바탕으로 지원과 확장 계획을 조정합니다.'],
] as const;

function findProductCategory(categoryId: string) {
  return PRODUCT_CATEGORIES.find((category) => category.id === categoryId);
}

export default function ProductCatalogExperience() {
  const [activeCategoryId, setActiveCategoryId] = useState(PRODUCT_CATEGORIES[0]!.id);
  const [openProductId, setOpenProductId] = useState(PRODUCT_CATEGORIES[0]!.products[0]!.id);
  const activeCategory = findProductCategory(activeCategoryId) ?? PRODUCT_CATEGORIES[0]!;
  const ActiveIcon = activeCategory.icon;

  const selectCategory = (category: ProductCategory, shouldUpdateHash = true) => {
    setActiveCategoryId(category.id);
    setOpenProductId(category.products[0]!.id);

    if (shouldUpdateHash && window.location.hash !== `#${category.id}`) {
      window.history.pushState({}, '', `#${category.id}`);
    }
  };

  useEffect(() => {
    const syncCategoryFromHash = () => {
      const category = findProductCategory(window.location.hash.slice(1));
      if (!category) return;

      setActiveCategoryId(category.id);
      setOpenProductId(category.products[0]!.id);
    };

    syncCategoryFromHash();
    window.addEventListener('hashchange', syncCategoryFromHash);
    return () => window.removeEventListener('hashchange', syncCategoryFromHash);
  }, []);

  const handleCategoryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = PRODUCT_CATEGORIES.findIndex((category) => category.id === activeCategory.id);
    const lastIndex = PRODUCT_CATEGORIES.length - 1;
    const nextIndex =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? currentIndex === lastIndex
          ? 0
          : currentIndex + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? currentIndex === 0
            ? lastIndex
            : currentIndex - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    const nextCategory = PRODUCT_CATEGORIES[nextIndex];
    if (!nextCategory) return;

    selectCategory(nextCategory);
    requestAnimationFrame(() => document.getElementById(`product-category-tab-${nextCategory.id}`)?.focus());
  };

  return (
    <CatalogPage id="content-area" aria-labelledby="product-catalog-title">
      <SkipLink href="#product-catalog">제품 목록으로 건너뛰기</SkipLink>
      <CatalogHeader>
        <HeaderCopy>
          <CatalogKicker>
            <ShoppingBag size={17} strokeWidth={2.3} aria-hidden="true" />
            Product introduction
          </CatalogKicker>
          <h1 id="product-catalog-title">제품소개</h1>
          <p>필요한 제품군을 먼저 고르고, 각 제품의 구성과 구매 상담 방법을 확인하세요.</p>
        </HeaderCopy>
        <CatalogSignal>
          <span>PRODUCTS</span>
          <strong>{TOTAL_PRODUCT_COUNT}</strong>
          <small>기존 제품 16개 · CY 실구동 웹제품 8개</small>
        </CatalogSignal>
      </CatalogHeader>

      <CatalogSection id="product-catalog" aria-labelledby="product-catalog-section-title" $accent={activeCategory.accent}>
        <SectionHeading>
          <div>
            <span>PRODUCT CATALOG</span>
            <h2 id="product-catalog-section-title">제품소개</h2>
            <p>기존 제품군과 상품은 그대로 유지하고, 웹·앱 제품과 업무자동화 안에 CY 실제 구동 화면 기반 상품을 함께 소개합니다.</p>
          </div>
          <ActiveCategoryMark aria-hidden="true" $accent={activeCategory.accent}>
            <ActiveIcon size={24} strokeWidth={2.1} />
            <span>{activeCategory.eyebrow}</span>
          </ActiveCategoryMark>
        </SectionHeading>

        <CategoryTabs role="tablist" aria-label="제품군 선택" onKeyDown={handleCategoryKeyDown}>
          {PRODUCT_CATEGORIES.map((category, index) => {
            const CategoryIcon = category.icon;
            const isActive = category.id === activeCategory.id;
            return (
              <CategoryTab
                id={`product-category-tab-${category.id}`}
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`product-category-panel-${category.id}`}
                tabIndex={isActive ? 0 : -1}
                $active={isActive}
                $accent={category.accent}
                onClick={() => selectCategory(category)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <CategoryIcon size={21} strokeWidth={2.3} aria-hidden="true" />
                <strong>{category.label}</strong>
                <small>제품 {category.products.length}개</small>
              </CategoryTab>
            );
          })}
        </CategoryTabs>

        <ProductPanel
          id={`product-category-panel-${activeCategory.id}`}
          role="tabpanel"
          aria-labelledby={`product-category-tab-${activeCategory.id}`}
          aria-live="polite"
        >
          <PanelHeader>
            <div>
              <span>{activeCategory.eyebrow}</span>
              <h3>{activeCategory.label}</h3>
              <p>{activeCategory.description}</p>
            </div>
            <strong>{activeCategory.products.length} PRODUCTS</strong>
          </PanelHeader>

          {activeCategory.id === 'partner' ? (
            <PartnerOverview aria-labelledby="partner-overview-title">
              <PartnerOverviewIntro>
                <span>PARTNERSHIP OPERATING SYSTEM</span>
                <h4 id="partner-overview-title">계약 이후에도 실제로 움직이는 파트너 운영 체계</h4>
                <p>
                  자료만 전달하고 끝나는 제휴가 아니라, 제품 이해부터 공동 영업·고객 지원·성과 개선까지
                  하나의 운영 흐름으로 연결합니다.
                </p>
                <PartnerOverviewActions>
                  <PartnerPrimaryLink href="/corp/partnership/business?product=partner-onboarding">
                    파트너 운영 상담하기
                    <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
                  </PartnerPrimaryLink>
                  <PartnerTextLink href="#partner-products">4개 운영 패키지 보기</PartnerTextLink>
                </PartnerOverviewActions>
              </PartnerOverviewIntro>

              <PartnerValueGrid aria-label="파트너 운영 핵심 가치">
                {PARTNER_VALUE_PROPOSITIONS.map((value) => {
                  const ValueIcon = value.icon;
                  return (
                    <PartnerValueCard key={value.label}>
                      <span><ValueIcon size={19} strokeWidth={2.2} aria-hidden="true" /></span>
                      <strong>{value.label}</strong>
                      <p>{value.description}</p>
                    </PartnerValueCard>
                  );
                })}
              </PartnerValueGrid>

              <PartnerJourney aria-labelledby="partner-journey-title">
                <PartnerJourneyHeading>
                  <span><Handshake size={18} strokeWidth={2.2} aria-hidden="true" /></span>
                  <div>
                    <strong id="partner-journey-title">도입부터 개선까지 한 흐름으로</strong>
                    <p>현재 운영 방식에 맞춰 필요한 단계와 패키지만 선택합니다.</p>
                  </div>
                </PartnerJourneyHeading>
                <PartnerJourneySteps>
                  {PARTNER_JOURNEY.map(([number, title, description]) => (
                    <li key={number}>
                      <span>{number}</span>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </li>
                  ))}
                </PartnerJourneySteps>
              </PartnerJourney>
            </PartnerOverview>
          ) : null}

          <ProductAccordions
            id={activeCategory.id === 'partner' ? 'partner-products' : undefined}
            aria-label={`${activeCategory.label} 제품 목록`}
          >
            {activeCategory.products.map((product, index) => {
              const isOpen = product.id === openProductId;
              const productPanelId = `product-detail-${activeCategory.id}-${product.id}`;
              const primaryScreen = product.screens?.[0];
              return (
                <ProductAccordion key={product.id} $open={isOpen} $accent={activeCategory.accent} data-product-accordion>
                  <ProductTrigger
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={productPanelId}
                    onClick={() => setOpenProductId((current) => (current === product.id ? '' : product.id))}
                  >
                    <ProductNumber>{String(index + 1).padStart(2, '0')}</ProductNumber>
                    <ProductTriggerCopy>
                      {product.isCy ? <CyLiveBadge>CY 실제 구동</CyLiveBadge> : null}
                      <strong>{product.name}</strong>
                      <span>{product.summary}</span>
                    </ProductTriggerCopy>
                    <ChevronBox $open={isOpen}>
                      <ChevronDown size={20} strokeWidth={2.4} aria-hidden="true" />
                    </ChevronBox>
                  </ProductTrigger>

                  <ProductDetail id={productPanelId} hidden={!isOpen} $live={Boolean(product.isCy)}>
                    <ProductPhoto $contain={activeCategory.id === 'partner' || Boolean(product.isCy)} $live={Boolean(product.isCy)}>
                      <Image
                        src={primaryScreen?.src ?? product.image}
                        alt={primaryScreen?.alt ?? product.imageAlt}
                        fill
                        sizes={product.isCy ? '(max-width: 760px) 100vw, 1000px' : '(max-width: 760px) 100vw, 44vw'}
                        loading={product.isCy || isOpen ? 'eager' : 'lazy'}
                      />
                      {product.isCy ? (
                        <figcaption>CY LIVE SCREEN · {primaryScreen?.title ?? '실제 개발 구동 화면'}</figcaption>
                      ) : activeCategory.id === 'partner' ? (
                        <figcaption>PARTNER OPERATING VISUAL</figcaption>
                      ) : null}
                    </ProductPhoto>
                    <ProductDescription>
                      <span>{product.isCy ? 'CY LIVE PRODUCT' : 'PRODUCT DETAIL'}</span>
                      <h4>{product.name}</h4>
                      <p>{product.description}</p>
                      {primaryScreen ? (
                        <LiveScreenContext>
                          <strong>{primaryScreen.title}</strong>
                          <span>{primaryScreen.description}</span>
                        </LiveScreenContext>
                      ) : null}
                      <ProductIncludes>
                        {product.includes.map((item) => (
                          <li key={item}>
                            <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </ProductIncludes>
                      <PurchaseRow>
                        <div>
                          <span>구매 방식</span>
                          <strong>{product.delivery}</strong>
                        </div>
                        <PurchaseLink href={product.isCy ? getCyQuoteMailto(product) : `/corp/partnership/business?product=${product.id}`}>
                          {product.isCy ? 'CY 상품 견적 요청' : '구매 상담 신청'}
                          <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
                        </PurchaseLink>
                      </PurchaseRow>
                    </ProductDescription>
                    {isOpen && product.screens && product.screens.length > 1 ? (
                      <ProductScreenGallery aria-label={`${product.name} 실제 구동 화면`}>
                        <GalleryHeading>
                          <span>CY SCREEN GALLERY</span>
                          <strong>업무 흐름을 증명하는 실제 화면</strong>
                          <p>설명용 목업이 아니라 CY에서 구축해 사용 중인 화면을 업무 단계별로 확인할 수 있습니다.</p>
                        </GalleryHeading>
                        <GalleryGrid>
                          {product.screens.slice(1).map((screen) => (
                            <ScreenCard key={screen.src}>
                              <ScreenImage>
                                <Image src={screen.src} alt={screen.alt} fill sizes="(max-width: 760px) 100vw, 520px" loading="eager" />
                              </ScreenImage>
                              <figcaption>
                                <strong>{screen.title}</strong>
                                <span>{screen.description}</span>
                              </figcaption>
                            </ScreenCard>
                          ))}
                        </GalleryGrid>
                      </ProductScreenGallery>
                    ) : null}
                  </ProductDetail>
                </ProductAccordion>
              );
            })}
          </ProductAccordions>
        </ProductPanel>
      </CatalogSection>
    </CatalogPage>
  );
}

const CatalogPage = styled.main`
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  background: #061126;
  color: #f4f7ef;
  padding: clamp(20px, 3vw, 40px) clamp(16px, 3vw, 54px) 64px;
`;

const SkipLink = styled.a`
  position: fixed;
  z-index: 30;
  top: 12px;
  left: 50%;
  transform: translate(-50%, -180%);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 14px;
  color: #061126;
  font-size: 0.82rem;
  font-weight: 900;
  text-decoration: none;
  transition: transform 160ms ease;

  &:focus,
  &:focus-visible {
    transform: translate(-50%, 0);
    outline: 3px solid #7dd3fc;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const CatalogHeader = styled.header`
  width: min(1240px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(230px, 300px);
  gap: 22px;
  align-items: stretch;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const HeaderCopy = styled.div`
  min-width: 0;
  border: 1px solid rgba(244, 247, 239, 0.13);
  border-radius: 10px;
  background: rgba(244, 247, 239, 0.045);
  padding: clamp(26px, 4vw, 48px);

  h1 {
    margin: 18px 0 0;
    color: #ffffff;
    font-size: clamp(2.25rem, 4.4vw, 4.25rem);
    font-weight: 950;
    line-height: 1;
    text-wrap: balance;
    word-break: keep-all;
  }

  p {
    max-width: 660px;
    margin: 16px 0 0;
    color: rgba(244, 247, 239, 0.7);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const CatalogKicker = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #7dd3fc;
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const CatalogSignal = styled.aside`
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 10px;
  background: #0b2143;
  padding: 26px;

  > span {
    color: rgba(244, 247, 239, 0.62);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.09em;
  }

  strong {
    margin-top: 6px;
    color: #ffffff;
    font-size: 4rem;
    font-weight: 950;
    line-height: 0.95;
  }

  small {
    margin-top: 12px;
    color: #7dd3fc;
    font-size: 0.82rem;
    font-weight: 800;
    line-height: 1.45;
    word-break: keep-all;
  }
`;

const CatalogSection = styled.section<{ $accent: string }>`
  --catalog-accent: ${(props) => props.$accent};
  width: min(1240px, 100%);
  margin: 22px auto 0;
  border: 1px solid rgba(244, 247, 239, 0.13);
  border-radius: 10px;
  background: #081a36;
  padding: clamp(20px, 3vw, 36px);
`;

const SectionHeading = styled.header`
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;

  > div {
    min-width: 0;
  }

  > div > span,
  h2 {
    color: #ffffff;
  }

  > div > span {
    color: var(--catalog-accent);
    font-size: 0.73rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  h2 {
    margin: 10px 0 0;
    font-size: clamp(1.7rem, 3vw, 2.6rem);
    font-weight: 950;
    line-height: 1.1;
    word-break: keep-all;
  }

  p {
    margin: 11px 0 0;
    color: rgba(244, 247, 239, 0.66);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  @media (max-width: 640px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const ActiveCategoryMark = styled.div<{ $accent: string }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid ${(props) => `${props.$accent}70`};
  border-radius: 8px;
  background: #07152c;
  padding: 10px 12px;
  color: ${(props) => props.$accent};

  span {
    color: rgba(244, 247, 239, 0.78);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.06em;
  }
`;

const CategoryTabs = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 26px;

  @media (max-width: 840px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const CategoryTab = styled.button<{ $active: boolean; $accent: string }>`
  min-width: 0;
  min-height: 156px;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 12px;
  border: 1px solid ${(props) => (props.$active ? `${props.$accent}99` : 'rgba(244, 247, 239, 0.12)')};
  border-radius: 9px;
  background: ${(props) => (props.$active ? '#0d274d' : '#07172e')};
  padding: 18px;
  color: #ffffff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease;

  > span {
    color: ${(props) => (props.$active ? props.$accent : 'rgba(244, 247, 239, 0.45)')};
    font-size: 0.71rem;
    font-weight: 950;
  }

  > svg {
    color: ${(props) => props.$accent};
  }

  strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.25;
    word-break: keep-all;
  }

  small {
    margin-top: auto;
    color: rgba(244, 247, 239, 0.62);
    font-size: 0.75rem;
    font-weight: 750;
  }

  &:hover {
    border-color: ${(props) => `${props.$accent}cc`};
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (max-width: 640px) {
    min-height: 138px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

const ProductPanel = styled.section`
  min-width: 0;
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--catalog-accent) 48%, rgba(244, 247, 239, 0.17));
  border-radius: 10px;
  background: #07172e;
  overflow: hidden;
`;

const PanelHeader = styled.header`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(244, 247, 239, 0.1);
  padding: 24px;

  > div {
    min-width: 0;
  }

  span {
    color: var(--catalog-accent);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  h3 {
    margin: 8px 0 0;
    color: #ffffff;
    font-size: clamp(1.35rem, 2.4vw, 2rem);
    font-weight: 950;
    line-height: 1.16;
    word-break: keep-all;
  }

  p {
    margin: 9px 0 0;
    color: rgba(244, 247, 239, 0.65);
    font-size: 0.89rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }

  > strong {
    flex: 0 0 auto;
    color: var(--catalog-accent);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  @media (max-width: 560px) {
    padding: 20px;

    > strong {
      display: none;
    }
  }
`;

const PartnerOverview = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
  gap: 24px;
  margin: 14px 12px 2px;
  border: 1px solid rgba(245, 199, 102, 0.34);
  border-radius: 12px;
  background:
    radial-gradient(circle at 8% 0%, rgba(245, 199, 102, 0.12), transparent 36%),
    linear-gradient(135deg, #0b2344 0%, #08182f 62%, #07152a 100%);
  padding: clamp(22px, 3vw, 34px);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 560px) {
    gap: 20px;
    margin-inline: 8px;
    padding: 22px 18px;
  }
`;

const PartnerOverviewIntro = styled.div`
  min-width: 0;
  align-self: center;

  > span {
    color: var(--catalog-accent);
    font-size: 0.68rem;
    font-weight: 950;
    letter-spacing: 0.11em;
  }

  h4 {
    max-width: 520px;
    margin: 12px 0 0;
    color: #ffffff;
    font-size: clamp(1.5rem, 2.8vw, 2.35rem);
    font-weight: 950;
    line-height: 1.16;
    text-wrap: balance;
    word-break: keep-all;
  }

  > p {
    max-width: 580px;
    margin: 16px 0 0;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.7;
    word-break: keep-all;
  }
`;

const PartnerOverviewActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;

  @media (max-width: 480px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PartnerPrimaryLink = styled(Link)`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid var(--catalog-accent);
  border-radius: 8px;
  background: var(--catalog-accent);
  padding: 0 16px;
  color: #061126;
  font-size: 0.83rem;
  font-weight: 950;
  text-decoration: none;
  transition: background-color 180ms ease, color 180ms ease;

  &:hover,
  &:focus-visible {
    background: transparent;
    color: var(--catalog-accent);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const PartnerTextLink = styled.a`
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 247, 239, 0.19);
  border-radius: 8px;
  background: rgba(244, 247, 239, 0.04);
  padding: 0 15px;
  color: rgba(244, 247, 239, 0.86);
  font-size: 0.8rem;
  font-weight: 850;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    border-color: var(--catalog-accent);
    color: var(--catalog-accent);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }
`;

const PartnerValueGrid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const PartnerValueCard = styled.article`
  min-width: 0;
  min-height: 190px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(244, 247, 239, 0.12);
  border-radius: 10px;
  background: rgba(4, 15, 32, 0.58);
  padding: 18px;

  > span {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(245, 199, 102, 0.44);
    border-radius: 9px;
    background: rgba(245, 199, 102, 0.09);
    color: var(--catalog-accent);
  }

  strong {
    margin-top: 18px;
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 900;
    line-height: 1.3;
  }

  p {
    margin: 9px 0 0;
    color: rgba(244, 247, 239, 0.64);
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.58;
    word-break: keep-all;
  }

  @media (max-width: 620px) {
    min-height: 0;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    column-gap: 12px;
    padding: 15px;

    > span {
      grid-row: 1 / span 2;
    }

    strong,
    p {
      margin-top: 0;
    }

    p {
      margin-top: 4px;
    }
  }
`;

const PartnerJourney = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(200px, 0.72fr) minmax(0, 2fr);
  gap: 22px;
  align-items: start;
  border-top: 1px solid rgba(244, 247, 239, 0.12);
  padding-top: 22px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

const PartnerJourneyHeading = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 11px;
  align-items: start;

  > span {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--catalog-accent);
    color: #061126;
  }

  strong {
    color: #ffffff;
    font-size: 0.93rem;
    font-weight: 900;
    line-height: 1.35;
  }

  p {
    margin: 5px 0 0;
    color: rgba(244, 247, 239, 0.58);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.5;
    word-break: keep-all;
  }
`;

const PartnerJourneySteps = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    min-width: 0;
    border-left: 1px solid rgba(245, 199, 102, 0.27);
    padding: 1px 14px 3px;
  }

  li > span {
    color: var(--catalog-accent);
    font-size: 0.66rem;
    font-weight: 950;
    letter-spacing: 0.08em;
  }

  li > strong {
    display: block;
    margin-top: 7px;
    color: #ffffff;
    font-size: 0.84rem;
    font-weight: 900;
  }

  li > p {
    margin: 7px 0 0;
    color: rgba(244, 247, 239, 0.6);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.5;
    word-break: keep-all;
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 0;
  }
`;

const ProductAccordions = styled.div`
  display: grid;
  gap: 10px;
  padding: 12px;
`;

const ProductAccordion = styled.article<{ $open: boolean; $accent: string }>`
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${(props) => (props.$open ? `${props.$accent}9c` : 'rgba(244, 247, 239, 0.11)')};
  border-radius: 9px;
  background: ${(props) => (props.$open ? '#0c2344' : '#081a33')};
`;

const ProductTrigger = styled.button`
  width: 100%;
  min-width: 0;
  min-height: 84px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 36px;
  gap: 13px;
  align-items: center;
  border: 0;
  background: transparent;
  padding: 16px 18px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: -4px;
  }
`;

const ProductNumber = styled.span`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--catalog-accent) 58%, rgba(244, 247, 239, 0.2));
  border-radius: 8px;
  color: var(--catalog-accent);
  font-size: 0.74rem;
  font-weight: 950;
`;

const ProductTriggerCopy = styled.span`
  min-width: 0;
  display: grid;
  gap: 5px;

  strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.24;
    word-break: keep-all;
  }

  span {
    overflow: hidden;
    color: rgba(244, 247, 239, 0.66);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    span {
      white-space: normal;
    }
  }
`;

const CyLiveBadge = styled.span`
  width: fit-content;
  overflow: visible !important;
  border: 1px solid color-mix(in srgb, var(--catalog-accent) 52%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--catalog-accent) 12%, transparent);
  padding: 4px 8px;
  color: var(--catalog-accent) !important;
  font-size: 0.62rem !important;
  font-weight: 950 !important;
  letter-spacing: 0.05em;
  line-height: 1 !important;
  white-space: nowrap !important;
`;

const ChevronBox = styled.span<{ $open: boolean }>`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 247, 239, 0.15);
  border-radius: 8px;
  color: rgba(244, 247, 239, 0.76);
  transform: rotate(${(props) => (props.$open ? '180deg' : '0deg')});
  transition: transform 180ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ProductDetail = styled.div<{ $live: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.$live ? '1fr' : 'minmax(300px, 0.9fr) minmax(0, 1.1fr)')};
  border-top: 1px solid rgba(244, 247, 239, 0.1);
  animation: product-detail-reveal 180ms ease both;

  @keyframes product-detail-reveal {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  &[hidden] {
    display: none;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ProductPhoto = styled.figure<{ $contain: boolean; $live: boolean }>`
  position: relative;
  min-height: ${(props) => (props.$live ? 'clamp(360px, 52vw, 620px)' : '320px')};
  margin: 0;
  border-right: 1px solid rgba(244, 247, 239, 0.1);
  background:
    radial-gradient(circle at 50% 44%, rgba(37, 99, 235, 0.18), transparent 56%),
    #061126;
  overflow: hidden;

  img {
    object-fit: ${(props) => (props.$contain ? 'contain' : 'cover')};
    padding: ${(props) => (props.$contain ? (props.$live ? 'clamp(8px, 1vw, 16px)' : 'clamp(12px, 2vw, 24px)') : '0')};
  }

  figcaption {
    position: absolute;
    left: 16px;
    bottom: 14px;
    z-index: 1;
    border: 1px solid rgba(125, 211, 252, 0.28);
    border-radius: 999px;
    background: rgba(3, 11, 25, 0.78);
    padding: 6px 9px;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    backdrop-filter: blur(8px);
  }

  @media (max-width: 760px) {
    min-height: min(62vw, 300px);
    border-right: 0;
    border-bottom: 1px solid rgba(244, 247, 239, 0.1);
  }
`;

const ProductDescription = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: clamp(22px, 3vw, 34px);

  > span {
    color: var(--catalog-accent);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.09em;
  }

  h4 {
    margin: 10px 0 0;
    color: #ffffff;
    font-size: clamp(1.3rem, 2.1vw, 1.85rem);
    font-weight: 950;
    line-height: 1.16;
    word-break: keep-all;
  }

  > p {
    margin: 14px 0 0;
    color: rgba(244, 247, 239, 0.72);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.65;
    word-break: keep-all;
  }
`;

const LiveScreenContext = styled.div`
  display: grid;
  gap: 6px;
  margin-top: 18px;
  border-left: 3px solid var(--catalog-accent);
  border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--catalog-accent) 8%, rgba(3, 11, 25, 0.6));
  padding: 14px 16px;

  strong {
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 900;
    word-break: keep-all;
  }

  span {
    color: rgba(244, 247, 239, 0.7);
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const ProductScreenGallery = styled.section`
  grid-column: 1 / -1;
  border-top: 1px solid rgba(244, 247, 239, 0.11);
  background: rgba(3, 11, 25, 0.42);
  padding: clamp(22px, 3vw, 34px);
`;

const GalleryHeading = styled.header`
  display: grid;
  gap: 7px;
  margin-bottom: 18px;

  > span {
    color: var(--catalog-accent);
    font-size: 0.66rem;
    font-weight: 950;
    letter-spacing: 0.09em;
  }

  > strong {
    color: #ffffff;
    font-size: clamp(1.1rem, 1.8vw, 1.45rem);
    font-weight: 950;
    line-height: 1.25;
    word-break: keep-all;
  }

  > p {
    max-width: 720px;
    margin: 0;
    color: rgba(244, 247, 239, 0.64);
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const GalleryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 14px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ScreenCard = styled.figure`
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-radius: 10px;
  background: #07162c;

  figcaption {
    display: grid;
    gap: 7px;
    border-top: 1px solid rgba(244, 247, 239, 0.09);
    padding: 16px;
  }

  figcaption strong {
    color: #ffffff;
    font-size: 0.94rem;
    font-weight: 900;
    line-height: 1.3;
    word-break: keep-all;
  }

  figcaption span {
    color: rgba(244, 247, 239, 0.67);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.55;
    word-break: keep-all;
  }
`;

const ScreenImage = styled.div`
  position: relative;
  aspect-ratio: 1280 / 653;
  background: #eef2f7;

  img {
    object-fit: contain;
  }
`;

const ProductIncludes = styled.ul`
  display: grid;
  gap: 9px;
  margin: 20px 0 0;
  padding: 16px 0 0;
  border-top: 1px solid rgba(244, 247, 239, 0.11);
  list-style: none;

  li {
    min-width: 0;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    color: rgba(244, 247, 239, 0.8);
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.45;
    word-break: keep-all;
  }

  svg {
    margin-top: 2px;
    color: var(--catalog-accent);
  }
`;

const PurchaseRow = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid rgba(244, 247, 239, 0.11);

  > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  > div > span {
    color: rgba(244, 247, 239, 0.52);
    font-size: 0.68rem;
    font-weight: 900;
  }

  > div > strong {
    color: rgba(244, 247, 239, 0.86);
    font-size: 0.8rem;
    font-weight: 800;
    line-height: 1.4;
    word-break: keep-all;
  }

  @media (max-width: 560px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PurchaseLink = styled(Link)`
  min-height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--catalog-accent);
  border-radius: 8px;
  background: var(--catalog-accent);
  padding: 0 14px;
  color: #061126;
  font-size: 0.82rem;
  font-weight: 950;
  text-decoration: none;
  touch-action: manipulation;
  transition: background-color 180ms ease, color 180ms ease;

  &:hover,
  &:focus-visible {
    background: transparent;
    color: var(--catalog-accent);
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
