'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faCheckSquare, faSquare } from '@fortawesome/free-solid-svg-icons';

// 미지급금 데이터 타입
interface UnpaidItem {
  id: string;
  supplier: string; // 매입처
  amount: number;
  dueDate: string;
  description: string;
}

export default function FullInquiryPage() {
  const [unpaidItems, setUnpaidItems] = useState<UnpaidItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // 샘플 데이터 - 실제로는 API나 Firestore에서 가져와야 함
  useEffect(() => {
    const sampleData: UnpaidItem[] = [
      {
        id: '1',
        supplier: 'ABC 회사',
        amount: 1000000,
        dueDate: '2024-04-15',
        description: '사무용품 구입',
      },
      {
        id: '2',
        supplier: 'XYZ 상사',
        amount: 2500000,
        dueDate: '2024-04-20',
        description: '컴퓨터 장비',
      },
      {
        id: '3',
        supplier: 'DEF 기업',
        amount: 500000,
        dueDate: '2024-04-25',
        description: '소프트웨어 라이선스',
      },
    ];
    queueMicrotask(() => {
      setUnpaidItems(sampleData);
      setLoading(false);
    });
  }, []);

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === unpaidItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(unpaidItems.map(item => item.id)));
    }
  };

  const downloadExcel = () => {
    const selectedData = unpaidItems.filter(item => selectedItems.has(item.id));

    if (selectedData.length === 0) {
      alert('선택된 항목이 없습니다.');
      return;
    }

    // 국민은행 엑셀 포맷으로 데이터 변환
    const excelData = selectedData.map(item => ({
      '거래일자': new Date().toISOString().split('T')[0],
      '적요': item.description,
      '입금': '',
      '출금': item.amount.toString(),
      '잔액': '', // 계산 필요
      '거래점': '본점',
      '메모': `매입처: ${item.supplier}`,
    }));

    // CSV로 다운로드 (간단한 구현)
    const csvContent = [
      Object.keys(excelData[0]).join(','),
      ...excelData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `국민은행_미지급금_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="p-6">로딩 중...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">미지급금 전체조회</h1>

      <div className="mb-4 flex justify-between items-center">
        <button
          onClick={handleSelectAll}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          <FontAwesomeIcon
            icon={selectedItems.size === unpaidItems.length ? faCheckSquare : faSquare}
            className="mr-2"
          />
          전체 선택/해제
        </button>

        <button
          onClick={downloadExcel}
          disabled={selectedItems.size === 0}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <FontAwesomeIcon icon={faDownload} className="mr-2" />
          국민은행 엑셀 다운로드 ({selectedItems.size}개)
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 border-b text-left">
                <input
                  type="checkbox"
                  checked={selectedItems.size === unpaidItems.length && unpaidItems.length > 0}
                  onChange={handleSelectAll}
                  className="mr-2"
                />
                선택
              </th>
              <th className="px-4 py-2 border-b text-left">매입처</th>
              <th className="px-4 py-2 border-b text-left">금액</th>
              <th className="px-4 py-2 border-b text-left">마감일</th>
              <th className="px-4 py-2 border-b text-left">내용</th>
            </tr>
          </thead>
          <tbody>
            {unpaidItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => handleSelectItem(item.id)}
                  />
                </td>
                <td className="px-4 py-2 border-b">{item.supplier}</td>
                <td className="px-4 py-2 border-b">{item.amount.toLocaleString()}원</td>
                <td className="px-4 py-2 border-b">{item.dueDate}</td>
                <td className="px-4 py-2 border-b">{item.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unpaidItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          미지급금 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}