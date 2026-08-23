import * as XLSX from 'xlsx';

export const downloadCsvTemplate = (type: 'employees' | 'vehicles') => {
  let content = '';
  let filename = '';
  if (type === 'employees') {
    content = 'APELLIDO,NOMBRE,ROLL,TELEFONO,GRUPO\nZUÑIGA BARAJAS,JEISON JAVIER,CONDUCTOR,235435464,R1\nARIZA MANCILLA,YORMAN ANDRES,AYUDANTE,42354353,R1';
    filename = 'plantilla_personal.csv';
  } else {
    content = 'Placa,Numero_Movil,Capacidad\nABC-123,V-01,15\nXYZ-999,V-02,20';
    filename = 'plantilla_vehiculos.csv';
  }
  
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const parseCsvFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawResults: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawResults.length < 2) {
          resolve([]);
          return;
        }
        
        const headers = (rawResults[0] as any[]).map(h => 
          String(h).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        
        const results = [];
        
        for (let i = 1; i < rawResults.length; i++) {
          const row = rawResults[i] as any[];
          if (!row || row.length === 0) continue;
          
          const obj: any = {};
          let hasValue = false;
          headers.forEach((h, idx) => {
            const val = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
            obj[h] = val;
            if (val !== '') hasValue = true;
          });
          
          if (hasValue) {
            results.push(obj);
          }
        }
        resolve(results);
      } catch (err) {
        console.error(err);
        reject(new Error("Error leyendo el archivo"));
      }
    };
    reader.onerror = () => reject(new Error("Error leyendo el archivo"));
    reader.readAsArrayBuffer(file);
  });
};
