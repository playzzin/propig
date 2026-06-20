import admin from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

/**
 * Firebase Admin SDK 사용 예시 API Route
 * 
 * 이 파일은 예시입니다. 실제 사용 시 필요에 따라 수정하세요.
 */
export async function GET() {
  try {
    // Firebase Admin이 정상적으로 초기화되었는지 확인
    const app = admin.app();
    
    return NextResponse.json({
      success: true,
      message: "Firebase Admin SDK가 정상적으로 초기화되었습니다.",
      appName: app.name,
    });
  } catch (error) {
    console.error("Firebase Admin 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Firebase Admin 초기화에 실패했습니다.",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      { status: 500 }
    );
  }
}
