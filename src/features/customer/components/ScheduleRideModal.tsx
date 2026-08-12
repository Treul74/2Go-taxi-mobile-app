import { Button } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScheduleRideModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    initialDate?: Date | null;
}

export function ScheduleRideModal({
    visible,
    onClose,
    onConfirm,
    initialDate
}: ScheduleRideModalProps) {
    const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
    const [days, setDays] = useState<{ label: string; date: Date; isToday: boolean }[]>([]);
    const [times, setTimes] = useState<{ label: string; value: { hour: number; minute: number } }[]>([]);

    const [activeDateIndex, setActiveDateIndex] = useState(0);
    const [activeTimeIndex, setActiveTimeIndex] = useState(-1);

    useEffect(() => {
        // Generate next 30 days
        const nextDays = [];
        const today = new Date();

        for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(today.getDate() + i);

            let label = '';
            if (i === 0) label = 'Today';
            else if (i === 1) label = 'Tomorrow';
            else label = `${d.getDate()}`; // Just the number as requested

            nextDays.push({
                label,
                date: d,
                isToday: i === 0,
            });
        }
        setDays(nextDays);

        // Generate times in 15-minute intervals
        const nextTimes = [];
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 15) {
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;
                const timeLabel = `${h12}:${m === 0 ? '00' : m} ${ampm}`;
                nextTimes.push({
                    label: timeLabel,
                    value: { hour: h, minute: m }
                });
            }
        }
        setTimes(nextTimes);

        // Set initial active indexes if initialDate exists
        if (initialDate) {
            // Find matching day
            const dayIdx = nextDays.findIndex(d =>
                d.date.getDate() === initialDate.getDate() &&
                d.date.getMonth() === initialDate.getMonth()
            );
            if (dayIdx !== -1) setActiveDateIndex(dayIdx);

            // Find closest time
            const h = initialDate.getHours();
            const m = Math.floor(initialDate.getMinutes() / 15) * 15;
            const timeIdx = nextTimes.findIndex(t => t.value.hour === h && t.value.minute === m);
            if (timeIdx !== -1) setActiveTimeIndex(timeIdx);
        } else {
            // Default to 30 mins from now rounded to next 15-min interval
            const now = new Date();
            const future = new Date(now.getTime() + 30 * 60000);
            future.setMinutes(Math.ceil(future.getMinutes() / 15) * 15);

            const dayIdx = nextDays.findIndex(d =>
                d.date.getDate() === future.getDate() &&
                d.date.getMonth() === future.getMonth()
            );
            if (dayIdx !== -1) setActiveDateIndex(dayIdx);

            const timeIdx = nextTimes.findIndex(t => t.value.hour === future.getHours() && t.value.minute === future.getMinutes());
            setActiveTimeIndex(timeIdx);
        }
    }, [visible, initialDate]);

    const isTimeInPast = (hour: number, minute: number) => {
        const day = days[activeDateIndex];
        if (!day) return false;

        const now = new Date();
        const compareDate = new Date(day.date);
        compareDate.setHours(hour, minute, 0, 0);

        return compareDate < now;
    };

    const handleConfirm = () => {
        if (activeDateIndex !== -1 && activeTimeIndex !== -1) {
            const time = times[activeTimeIndex].value;
            if (isTimeInPast(time.hour, time.minute)) return;

            const day = days[activeDateIndex].date;
            const result = new Date(day);
            result.setHours(time.hour, time.minute, 0, 0);

            onConfirm(result);
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <View className="bg-white rounded-t-5xl">
                    {/* Header */}
                    <View className="px-6 pt-6 pb-4 border-b border-gray-100 flex-row items-center justify-between">
                        <Text className="text-primary font-bold text-xl">
                            Schedule Ride
                        </Text>
                        <Pressable
                            onPress={onClose}
                            className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                        >
                            <Ionicons name="close" size={20} color="#26344F" />
                        </Pressable>
                    </View>

                    <View className="p-6">
                        {/* Day Selector */}
                        <Text className="text-primary font-semibold mb-3 ml-1">Select Day</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="flex-row mb-6"
                        >
                            {days.map((day, index) => (
                                <Pressable
                                    key={day.date.toISOString()}
                                    onPress={() => setActiveDateIndex(index)}
                                    className={`mr-3 items-center justify-center rounded-2xl ${activeDateIndex === index ? 'bg-primary' : 'bg-gray-100'
                                        } ${day.label.length > 2 ? 'px-5 py-3' : 'w-14 h-14'}`}
                                >
                                    <Text className={`font-bold ${activeDateIndex === index ? 'text-white' : 'text-primary'
                                        } ${day.label.length > 2 ? 'text-sm' : 'text-lg'}`}>
                                        {day.label}
                                    </Text>
                                    {day.label.length <= 2 && (
                                        <Text className={`text-[10px] font-medium uppercase mt-0.5 ${activeDateIndex === index ? 'text-white/70' : 'text-secondary'
                                            }`}>
                                            {day.date.toLocaleString('default', { month: 'short' })}
                                        </Text>
                                    )}
                                </Pressable>
                            ))}
                        </ScrollView>

                        {/* Time Selector */}
                        <Text className="text-primary font-semibold mb-3 ml-1">Select Time</Text>
                        <View className="h-48">
                            <FlatList
                                data={times}
                                keyExtractor={(item) => item.label}
                                renderItem={({ item, index }) => {
                                    const past = isTimeInPast(item.value.hour, item.value.minute);
                                    return (
                                        <Pressable
                                            onPress={() => !past && setActiveTimeIndex(index)}
                                            className={`py-4 px-6 rounded-2xl mb-2 flex-row items-center justify-between ${activeTimeIndex === index ? 'bg-primary/10 border-2 border-primary' : 'bg-gray-50'
                                                } ${past ? 'opacity-30' : ''}`}
                                            disabled={past}
                                        >
                                            <Text className={`text-base font-semibold ${activeTimeIndex === index ? 'text-primary' : 'text-secondary'
                                                }`}>
                                                {item.label}
                                            </Text>
                                            {activeTimeIndex === index && (
                                                <Ionicons name="checkmark-circle" size={20} color="#FE5035" />
                                            )}
                                        </Pressable>
                                    );
                                }}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>

                        {/* Selected Summary */}
                        <View className="mt-8 bg-gray-50 p-4 rounded-3xl flex-row items-center">
                            <View className="bg-primary/10 w-10 h-10 rounded-full items-center justify-center">
                                <Ionicons name="calendar" size={20} color="#FE5035" />
                            </View>
                            <View className="ml-4">
                                <Text className="text-primary font-bold">
                                    {days[activeDateIndex]?.label === 'Today' || days[activeDateIndex]?.label === 'Tomorrow'
                                        ? days[activeDateIndex]?.label
                                        : `On the ${days[activeDateIndex]?.label || ''}${getOrdinal(days[activeDateIndex]?.label || '')}`} at {times[activeTimeIndex]?.label}
                                </Text>
                                <Text className="text-secondary text-xs">Pickup will be requested automatically</Text>
                            </View>
                        </View>
                    </View>

                    {/* Action Button */}
                    <SafeAreaView edges={['bottom']} className="px-6 py-4 border-t border-gray-100">
                        <Button
                            variant="accent"
                            size="lg"
                            fullWidth
                            onPress={handleConfirm}
                            disabled={activeDateIndex === -1 || activeTimeIndex === -1}
                        >
                            Confirm Schedule
                        </Button>
                    </SafeAreaView>
                </View>
            </View>
        </Modal>
    );
}

function getOrdinal(n: string) {
    const num = parseInt(n);
    if (isNaN(num)) return '';
    const s = ["th", "st", "nd", "rd"];
    const v = num % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}
