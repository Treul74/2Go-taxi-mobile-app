import { Button } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View
} from 'react-native';

interface InstructionsModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (instructions: string) => void;
    initialValue?: string;
}

export function InstructionsModal({
    visible,
    onClose,
    onConfirm,
    initialValue = ''
}: InstructionsModalProps) {
    const [instructions, setInstructions] = useState(initialValue);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            setInstructions(initialValue);
        }
    }, [visible, initialValue]);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    const handleConfirm = () => {
        onConfirm(instructions.trim());
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <Pressable
                    className="flex-1 bg-black/50"
                    onPress={() => {
                        Keyboard.dismiss();
                        onClose();
                    }}
                >
                    <View className="flex-1 justify-end">
                        <Pressable
                            className="bg-white rounded-t-5xl"
                            onPress={(e) => e.stopPropagation()}
                        >
                            {/* Done button accessory - Always visible above keyboard area when keyboard is up */}
                            {keyboardVisible && (
                                <View className="bg-gray-50 px-6 py-2 border-b border-gray-100 flex-row justify-end">
                                    <Pressable
                                        onPress={() => Keyboard.dismiss()}
                                        className="bg-primary px-4 py-2 rounded-full"
                                    >
                                        <Text className="text-white font-bold">Done</Text>
                                    </Pressable>
                                </View>
                            )}

                            {/* Header */}
                            <View className="px-6 pt-6 pb-4 border-gray-100 flex-row items-center justify-between">
                                <Text className="text-primary font-bold text-xl">
                                    Note for driver
                                </Text>
                                <Pressable
                                    onPress={onClose}
                                    className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                                >
                                    <Ionicons name="close" size={20} color="#26344F" />
                                </Pressable>
                            </View>

                            <ScrollView className="px-6 pb-6">
                                <Text className="text-secondary text-sm mb-4">
                                    Add helpful instructions for your driver (e.g., exact pickup gate, gate code, or what you're wearing).
                                </Text>

                                <View className="bg-gray-100 rounded-3xl p-4 min-h-[160px]">
                                    <TextInput
                                        ref={inputRef}
                                        className="text-primary text-base min-h-[120px]"
                                        placeholder="Type your notes here..."
                                        placeholderTextColor="#7B8387"
                                        value={instructions}
                                        onChangeText={setInstructions}
                                        multiline
                                        numberOfLines={6}
                                        textAlignVertical="top"
                                        autoFocus={true}
                                    />
                                    <Text className="text-secondary text-xs text-right mt-2">
                                        {instructions.length} characters
                                    </Text>
                                </View>

                                {/* Confirm button - visible when keyboard is down */}
                                {!keyboardVisible && (
                                    <Button
                                        variant="accent"
                                        size="lg"
                                        fullWidth
                                        onPress={handleConfirm}
                                        className="mt-6"
                                    >
                                        Save Instructions
                                    </Button>
                                )}

                                {/* Visual spacer for when keyboard is up */}
                                {keyboardVisible && <View style={{ height: 20 }} />}
                            </ScrollView>
                        </Pressable>
                    </View>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}
