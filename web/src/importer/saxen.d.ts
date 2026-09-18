declare module 'saxen' {
  type AttributeGetter = () => Record<string, string>;
  type DecodeEntities = (value: string) => string;

  export class Parser {
    on(
      event: 'openTag',
      callback: (
        name: string,
        attributes: AttributeGetter,
        decodeEntities: DecodeEntities,
        selfClosing: boolean,
      ) => void,
    ): this;
    on(
      event: 'closeTag',
      callback: (name: string) => void,
    ): this;
    on(
      event: 'text',
      callback: (
        value: string,
        decodeEntities: DecodeEntities,
      ) => void,
    ): this;
    on(
      event: 'error' | 'warn',
      callback: (error: Error) => void,
    ): this;
    parse(xml: string): void;
  }
}
