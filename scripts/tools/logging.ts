let prepend: string = "";
export function print(level: string, message: string) {
    console.log(level, "[" + new Date().toUTCString() + "]", prepend, message);
}

export function log(message: string) {
    print("INFO:   ", message)
}

export function error(message: string) {
    print("ERROR:  ", message)
}

export function warning(message: string) {
    print("WARNING:", message)
}

export function resetPrepend() {
    prepend = ""
}

export function increasePrepend() {
    prepend += "    ";
}

export function decreasePrepend() {
    prepend = prepend.substring(0, prepend.length - 4);
}