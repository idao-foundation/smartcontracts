export function delay(sec: number) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}