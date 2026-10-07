// "正在编辑"计数：有未保存的输入时（例如详情页编辑中），不自动套用新版本，避免刷新丢内容
let holds = 0;
export function holdBusy(): () => void {
  holds++;
  let released = false;
  return () => {
    if (!released) holds--;
    released = true;
  };
}
export const isBusy = () => holds > 0;
