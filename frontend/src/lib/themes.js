import { Target, Heart, Compass, Flame, Briefcase, Eye, MessageSquare } from "lucide-react";

export const THEMES = [
  { id: "disciplina", label: "Disciplina", Icon: Target },
  { id: "relacionamentos", label: "Relacionamentos", Icon: Heart },
  { id: "proposito", label: "Propósito", Icon: Compass },
  { id: "emocoes", label: "Emoções", Icon: Flame },
  { id: "carreira", label: "Carreira", Icon: Briefcase },
  { id: "autoconhecimento", label: "Autoconhecimento", Icon: Eye },
  { id: "outros", label: "Outros", Icon: MessageSquare },
];

export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[THEMES.length - 1];
