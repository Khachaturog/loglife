import { useMemo } from "react";
import { Text } from "@radix-ui/themes";
import { Link2Icon } from "@radix-ui/react-icons";
import { parseDescriptionToSegments } from "@/lib/deed-description-segments";
import styles from "./DeedDescriptionText.module.css";
import { Link } from "react-router-dom";
type DeedDescriptionTextProps = {
  text: string;
};

/**
 * Описание дела на экране просмотра: сохраняет переносы строк, URL показывает компактно (иконка + «Ссылка»).
 */
export function DeedDescriptionText({ text }: DeedDescriptionTextProps) {
  const segments = useMemo(() => parseDescriptionToSegments(text), [text]);

  return (
    <Text as="p" color="gray" size="2" className={styles.root}>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <Link
            key={i}
            to={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            <Link2Icon width={14} height={14} className={styles.linkIcon} aria-hidden />
            <span className={styles.linkLabel}>Ссылка</span>
          </Link>
        ),
      )}
    </Text>
  );
}
