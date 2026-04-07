import { useNavigate } from "react-router-dom";
import {
  IconBarChartVStroked,
  IconDownload,
  IconList,
} from "@douyinfe/semi-icons";
import { Button, Card, Col, Row, Space, Typography } from "@douyinfe/semi-ui";
import HomeHeroIllustration from "../components/HomeHeroIllustration";

const { Title, Paragraph, Text } = Typography;

const featureCardBody = {
  padding: "20px 20px 22px",
} as const;

export default function HomePage() {
  const nav = useNavigate();

  const features = [
    {
      step: "1",
      title: "按标准分项打分",
      desc: "十项一级指标逐项录入与复核，对齐内置评测框架与红线规则。",
      icon: (
        <span
          style={{
            display: "inline-flex",
            width: 48,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(var(--semi-blue-0), 1)",
            color: "rgba(var(--semi-blue-6), 1)",
          }}
        >
          <IconList style={{ fontSize: 26 }} />
        </span>
      ),
    },
    {
      step: "2",
      title: "自动汇总结论",
      desc: "依据得分与一票否决、重点项等规则，自动生成通过 / 整改 / 不通过等结论。",
      icon: (
        <span
          style={{
            display: "inline-flex",
            width: 48,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(var(--semi-blue-0), 1)",
            color: "rgba(var(--semi-blue-6), 1)",
          }}
        >
          <IconBarChartVStroked style={{ fontSize: 26 }} />
        </span>
      ),
    },
    {
      step: "3",
      title: "快速导出报告",
      desc: "一键生成 HTML 评审报告，支持浏览器打印或另存为 PDF，便于归档与汇报。",
      icon: (
        <span
          style={{
            display: "inline-flex",
            width: 48,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(var(--semi-blue-0), 1)",
            color: "rgba(var(--semi-blue-6), 1)",
          }}
        >
          <IconDownload style={{ fontSize: 26 }} />
        </span>
      ),
    },
  ];

  return (
    <Card
      bordered
      shadows="hover"
      style={{ width: "100%", overflow: "hidden" }}
      bodyStyle={{
        padding: "clamp(28px, 5vw, 56px) clamp(20px, 4vw, 40px) clamp(36px, 6vw, 72px)",
      }}
    >
      <Row gutter={[40, 48]} type="flex" align="top">
        <Col xs={24} xl={15}>
          <Title
            heading={1}
            style={{
              margin: "0 0 12px",
              fontSize: "clamp(1.65rem, 4vw, 2.25rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.25,
            }}
          >
            智能化方案评审平台
          </Title>
          <Paragraph
            type="secondary"
            style={{
              margin: "0 0 clamp(28px, 5vw, 44px)",
              fontSize: 17,
              lineHeight: 1.7,
            }}
          >
            专业、标准、高效的方案评审与报告生成
          </Paragraph>

          <Text
            strong
            style={{
              fontSize: 15,
              letterSpacing: "0.06em",
              color: "rgba(var(--semi-grey-8), 1)",
            }}
          >
            核心功能
          </Text>

          <Row gutter={[16, 16]} style={{ marginTop: 18 }}>
            {features.map((f) => (
              <Col xs={24} sm={24} md={8} key={f.step}>
                <Card
                  bordered={false}
                  className="home-feature-card"
                  bodyStyle={featureCardBody}
                  style={{ height: "100%" }}
                >
                  <div style={{ marginBottom: 14 }}>{f.icon}</div>
                  <Title heading={6} style={{ margin: "0 0 8px" }}>
                    {f.step}. {f.title}
                  </Title>
                  <Paragraph
                    type="tertiary"
                    size="small"
                    style={{ margin: 0, lineHeight: 1.65 }}
                  >
                    {f.desc}
                  </Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </Col>

        <Col xs={24} xl={9}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 280,
            }}
          >
            <HomeHeroIllustration />
          </div>
        </Col>
      </Row>

      <div
        style={{
          marginTop: "clamp(48px, 8vw, 96px)",
          paddingTop: "clamp(40px, 7vw, 72px)",
          borderTop: "1px solid rgba(var(--semi-border-color), 0.5)",
          display: "flex",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <Space wrap spacing="loose" align="center">
          <Button
            theme="solid"
            type="primary"
            size="large"
            onClick={() => nav("/tasks/new")}
          >
            创建评审任务
          </Button>
          <Button
            theme="light"
            type="primary"
            size="large"
            onClick={() => nav("/methods")}
          >
            配置测评智能体
          </Button>
        </Space>
      </div>
    </Card>
  );
}
