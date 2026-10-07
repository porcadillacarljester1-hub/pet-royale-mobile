import { Text, TextInput } from 'react-native';

// Lets text grow with the phone's font setting, but only up to 130%.
const CAP = 1.3;

for (const Component of [Text, TextInput] as any[]) {
  const render = Component.render;
  if (typeof render !== 'function') continue;
  Component.render = function (props: any, ref: any) {
    return render.call(this, { maxFontSizeMultiplier: CAP, ...props }, ref);
  };
}