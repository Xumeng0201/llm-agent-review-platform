import { ConfigProvider } from "@douyinfe/semi-ui";
import zh_CN from "@douyinfe/semi-ui/lib/es/locale/source/zh_CN";

export default function SemiAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfigProvider locale={zh_CN}>{children}</ConfigProvider>;
}
