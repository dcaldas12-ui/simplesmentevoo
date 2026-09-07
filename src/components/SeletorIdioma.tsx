import { Languages } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IDIOMAS, useIdioma, type Idioma } from "@/lib/i18n";

export function SeletorIdioma() {
  const { idioma, mudarIdioma, t } = useIdioma();

  return (
    <Select value={idioma} onValueChange={(v) => mudarIdioma(v as Idioma)}>
      <SelectTrigger
        aria-label={t("idioma.rotulo")}
        className="h-10 w-[7.5rem] gap-2 md:h-9"
      >
        <Languages className="size-4 shrink-0" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {IDIOMAS.map((i) => (
          <SelectItem key={i.valor} value={i.valor}>
            {i.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
