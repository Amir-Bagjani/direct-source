import type { ReactNode } from "react";

export interface ModalProps {
  children: ReactNode;
  labelledBy: string;
  name: string;
  /** Create a modal history entry; false lets Back navigate to the previous page. Set before opening. */
  closeOnBack?: boolean;
}
